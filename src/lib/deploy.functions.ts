import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dumpProjectFiles, runCommand } from "@/server/e2b-sandbox.server";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type GithubRepoMetadata = {
  owner?: unknown;
  name?: unknown;
  branch?: unknown;
  html_url?: unknown;
};

async function resolveGithubCommitIdentity(token: string): Promise<{
  name: string;
  email: string;
}> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Nexyra-Deploy",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub utilisateur introuvable (${res.status})`);
  }

  const user = (await res.json()) as { id?: number; login?: string; name?: string | null };
  if (!user.id || !user.login) {
    throw new Error("Impossible d'identifier le compte GitHub du token");
  }

  return {
    name: user.name?.trim() || user.login,
    email: `${user.id}+${user.login}@users.noreply.github.com`,
  };
}

/**
 * Deploys an arbitrary set of files to Vercel as a fresh deployment.
 *
 * Uses the Vercel REST API v13 (`POST /v13/deployments`) with inline file
 * payloads (data URI). Requires `VERCEL_TOKEN` in env (server-only secret).
 *
 * Returns the deployment URL once Vercel acknowledges the request. The build
 * itself runs async on Vercel's side — the URL is live once the build finishes.
 */
export const deployToVercel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectName: z
          .string()
          .min(1)
          .max(52)
          .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits, hyphens only"),
        files: z.record(z.string(), z.string()).refine((f) => Object.keys(f).length > 0, {
          message: "files map cannot be empty",
        }),
        framework: z.string().default("vite"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const filesPayload = Object.entries(data.files).map(([file, contents]) => ({
      file: file.replace(/^\.?\//, ""),
      data: contents,
      encoding: "utf-8" as const,
    }));
    return deployFilesToVercel(data.projectName, filesPayload, data.framework);
  });

export const deploySandboxToVercel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().min(1).max(120),
        projectName: z
          .string()
          .min(1)
          .max(52)
          .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits, hyphens only"),
        framework: z.string().default("vite"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const dumped = await dumpProjectFiles(context.userId, data.projectId);
    const filesPayload = dumped.files.map((file) => ({
      file: file.path.replace(/^\.?\//, ""),
      data: file.contents,
      encoding: (file.encoding ?? "utf-8") as "utf-8" | "base64",
    }));
    if (filesPayload.length === 0) {
      return { ok: false as const, error: "Aucun fichier à déployer dans la sandbox" };
    }
    return deployFilesToVercel(data.projectName, filesPayload, data.framework);
  });

/**
 * Pour les projets connectés GitHub → Vercel, on ne doit surtout pas refaire
 * un upload direct à Vercel : cela crée un déploiement sans source Git et peut
 * casser le lien visible côté Vercel. On pousse donc la sandbox vers GitHub ;
 * Vercel redéploie ensuite automatiquement depuis la branche connectée.
 */
export const deploySandboxViaGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().min(1).max(120),
        commitMessage: z.string().min(1).max(500).default("Update from Nexyra"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { ok: false as const, error: "GITHUB_TOKEN non configuré côté serveur" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project, error } = await (supabaseAdmin as any)
      .from("projects")
      .select("id,name,metadata")
      .eq("id", data.projectId)
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!project) return { ok: false as const, error: "Projet introuvable" };

    const metadata = ((project.metadata ?? {}) as Record<string, unknown>) || {};
    const repoMeta = (metadata.github_repo ?? {}) as GithubRepoMetadata;
    const owner = readString(repoMeta.owner);
    const repo = readString(repoMeta.name);
    const branch = readString(repoMeta.branch) ?? "main";
    const publicUrl = readString(metadata.vercel_public_url);

    if (!owner || !repo) {
      return {
        ok: false as const,
        error: "Ce projet n'a pas encore de dépôt GitHub lié dans Nexyra.",
      };
    }

    const safeBranch = branch.replace(/[^a-zA-Z0-9._/-]/g, "-");
    const safeMsg = data.commitMessage.replace(/[\r\n]+/g, " ").slice(0, 500);
    const commitIdentity = await resolveGithubCommitIdentity(token);
    const remoteWithToken = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    const remoteClean = `https://github.com/${owner}/${repo}.git`;

    const script = [
      "set -e",
      "cd /home/user/app",
      `git config user.email ${shellQuote(commitIdentity.email)} >/dev/null 2>&1`,
      `git config user.name ${shellQuote(commitIdentity.name)} >/dev/null 2>&1`,
      "git config init.defaultBranch main >/dev/null 2>&1",
      "if [ ! -d .git ]; then git init -q; fi",
      "[ -f .gitignore ] || printf 'node_modules\\ndist\\n.env\\n.env.local\\n' > .gitignore",
      "git remote remove origin 2>/dev/null || true",
      `git remote add origin ${shellQuote(remoteWithToken)}`,
      `git checkout -B ${shellQuote(safeBranch)} >/dev/null 2>&1 || true`,
      "git add -A",
      `git commit -m ${shellQuote(safeMsg)} --allow-empty -q`,
      `git push -u origin ${shellQuote(safeBranch)} --force 2>&1 | sed 's#x-access-token:[^@]*@#REDACTED@#g'`,
      `git remote set-url origin ${shellQuote(remoteClean)}`,
      "echo '---SHA---'",
      "git rev-parse HEAD",
    ].join(" && ");

    try {
      const result = await runCommand(
        context.userId,
        data.projectId,
        `bash -lc ${shellQuote(script)}`,
        { cwd: "/home/user/app", timeoutMs: 180_000 },
      );
      const stdout = result.stdout.split(token).join("REDACTED");
      const stderr = result.stderr.split(token).join("REDACTED");
      if (result.exitCode !== 0) {
        return {
          ok: false as const,
          error: `Push GitHub échoué (code ${result.exitCode})`,
          details: (stderr || stdout).slice(-1200),
        };
      }
      const shaMatch = stdout.match(/---SHA---\s*([a-f0-9]{7,40})/);
      return {
        ok: true as const,
        repoUrl: readString(repoMeta.html_url) ?? remoteClean,
        branch: safeBranch,
        commitSha: shaMatch?.[1] ?? null,
        vercelUrl: publicUrl,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Interroge Vercel pour connaître le statut d'un déploiement (READY / ERROR / BUILDING…).
 * Le front l'appelle en boucle après `deploySandboxToVercel` jusqu'à un état terminal.
 */
export const getVercelDeploymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ deploymentId: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      return { ok: false as const, error: "VERCEL_TOKEN not configured" };
    }
    try {
      const res = await fetch(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(data.deploymentId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as {
        readyState?: string;
        url?: string;
        alias?: string[];
        errorMessage?: string;
        inspectorUrl?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          ok: false as const,
          error: json.error?.message ?? `HTTP ${res.status}`,
        };
      }
      const stableHost =
        Array.isArray(json.alias) && json.alias.length > 0
          ? [...json.alias].sort((a, b) => a.length - b.length)[0]
          : null;
      return {
        ok: true as const,
        state: json.readyState ?? "QUEUED",
        url: json.url ? `https://${json.url}` : null,
        stableUrl: stableHost ? `https://${stableHost}` : null,
        errorMessage: json.errorMessage ?? null,
        inspectorUrl: json.inspectorUrl ?? null,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

async function deployFilesToVercel(
  projectName: string,
  files: { file: string; data: string; encoding: "utf-8" | "base64" }[],
  framework: string,
) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return { ok: false as const, error: "VERCEL_TOKEN not configured on server" };
  }

  const filesPayload = files.map(({ file, data, encoding }) => ({
    file: file.replace(/^\.?\//, ""),
    data,
    encoding,
  }));

  try {
    const res = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        files: filesPayload,
        projectSettings: { framework },
        target: "production",
      }),
    });

    const json: unknown = await res.json();
    if (!res.ok) {
      const errMsg =
        typeof json === "object" && json !== null && "error" in json
          ? JSON.stringify((json as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false as const, error: errMsg };
    }

    const j = json as {
      url?: string;
      id?: string;
      readyState?: string;
      alias?: string[];
    };
    // Pick the shortest alias as the "stable" production URL (typically
    // `<project>-<scope>.vercel.app` — same across redeploys).
    const stableHost =
      Array.isArray(j.alias) && j.alias.length > 0
        ? [...j.alias].sort((a, b) => a.length - b.length)[0]
        : null;
    return {
      ok: true as const,
      url: j.url ? `https://${j.url}` : null,
      stableUrl: stableHost ? `https://${stableHost}` : null,
      id: j.id ?? null,
      state: j.readyState ?? "QUEUED",
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
