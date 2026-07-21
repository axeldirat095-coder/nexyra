/**
 * Server functions GitHub — exposées au client.
 *
 * Toutes scopées à l'utilisateur authentifié (requireSupabaseAuth).
 * Le token GitHub n'est JAMAIS renvoyé au client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CALLBACK_PATH = "/api/public/github/callback";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildRedirectUri(): string {
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.origin}${CALLBACK_PATH}`;
}

export const getGithubConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("@/server/github.server");
    const conn = await getConnectionForUser(context.userId);
    if (!conn) return { connected: false as const };
    return {
      connected: true as const,
      username: conn.github_username,
      avatarUrl: conn.avatar_url,
      scope: conn.scope,
    };
  });

export const startGithubOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { createOAuthState, buildAuthorizeUrl } = await import("@/server/github.server");
    const state = await createOAuthState(context.userId);
    const redirectUri = buildRedirectUri();
    const url = buildAuthorizeUrl({ state, redirectUri });
    return { url, redirectUri };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteConnectionForUser } = await import("@/server/github.server");
    await deleteConnectionForUser(context.userId);
    return { ok: true };
  });

export const listGithubRepos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser, listUserRepos } = await import("@/server/github.server");
    const conn = await getConnectionForUser(context.userId);
    if (!conn) {
      return { connected: false as const, repos: [] as Array<never> };
    }
    try {
      const repos = await listUserRepos(conn.access_token);
      return {
        connected: true as const,
        repos: repos.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          owner: r.owner.login,
          ownerAvatar: r.owner.avatar_url,
          private: r.private,
          defaultBranch: r.default_branch,
          description: r.description,
          pushedAt: r.pushed_at,
          htmlUrl: r.html_url,
          cloneUrl: r.clone_url,
        })),
      };
    } catch (err) {
      return {
        connected: true as const,
        repos: [] as Array<never>,
        error: err instanceof Error ? err.message : "Erreur GitHub",
      };
    }
  });

export const listGithubBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        owner: z.string().min(1).max(120),
        repo: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getConnectionForUser, listRepoBranches } = await import("@/server/github.server");
    const conn = await getConnectionForUser(context.userId);
    if (!conn) throw new Error("GitHub non connecté");
    const branches = await listRepoBranches(conn.access_token, data.owner, data.repo);
    return { branches: branches.map((b) => b.name) };
  });

export const importGithubRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        owner: z.string().min(1).max(120),
        repo: z.string().min(1).max(120),
        branch: z.string().min(1).max(200),
        projectId: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getConnectionForUser } = await import("@/server/github.server");
    const { ensureSandbox, runCommand } = await import("@/server/e2b-sandbox.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const conn = await getConnectionForUser(context.userId);
    if (!conn) throw new Error("GitHub non connecté");

    // 1) Sandbox up
    await ensureSandbox(context.userId, data.projectId);

    const token = conn.access_token;
    const cloneUrl = `https://x-access-token:${token}@github.com/${data.owner}/${data.repo}.git`;
    const safeCloneUrl = shellQuote(cloneUrl);
    const safeBranch = shellQuote(data.branch);
    const safePublicOrigin = shellQuote(`https://github.com/${data.owner}/${data.repo}.git`);

    // 2) Wipe app dir + clone (force fresh state — destructive)
    // On redirige stderr -> stdout pour que les vraies erreurs git remontent même si
    // le SDK E2B lève une exception ("exit status 128") sans nous donner stderr.
    let clone: { exitCode: number; stdout: string; stderr: string };
    try {
      clone = await runCommand(
        context.userId,
        data.projectId,
        `if test -f /tmp/vite.pid; then kill "$(cat /tmp/vite.pid)" 2>/dev/null || true; fi; rm -f /tmp/nexyra-install.log /tmp/nexyra-install.pid /tmp/nexyra-install.done /tmp/nexyra-install.failed /tmp/vite.log /tmp/vite.pid; rm -rf /home/user/app_new /home/user/app.bak 2>/dev/null; git clone --depth 1 --single-branch --branch ${safeBranch} ${safeCloneUrl} /home/user/app_new 2>&1 && (mv /home/user/app /home/user/app.bak 2>/dev/null; true) && mv /home/user/app_new /home/user/app && rm -rf /home/user/app.bak && cd /home/user/app && git remote set-url origin ${safePublicOrigin} && touch .nexyra-readonly-import`,
        { background: false, timeoutMs: 480_000 },
      );
    } catch (err) {
      const anyErr = err as any;
      const stderr = anyErr?.result?.stderr ?? anyErr?.stderr ?? "";
      const stdout = anyErr?.result?.stdout ?? anyErr?.stdout ?? "";
      const detail = String(stderr || stdout || (err instanceof Error ? err.message : "erreur inconnue"))
        .replace(/x-access-token:[^@]+@/g, "x-access-token:***@")
        .slice(0, 400);
      throw new Error(`git clone échoué — ${detail}`);
    }
    if (clone.exitCode !== 0) {
      const detail = String(clone.stderr || clone.stdout || "")
        .replace(/x-access-token:[^@]+@/g, "x-access-token:***@")
        .slice(0, 400);
      throw new Error(`git clone échoué (code ${clone.exitCode}) — ${detail || "pas de détail"}`);
    }

    let verify: { exitCode: number; stdout: string; stderr: string };
    try {
      verify = await runCommand(
        context.userId,
        data.projectId,
        `cd /home/user/app 2>&1 && { test -f package.json || { echo "MISSING:package.json"; ls -la; exit 2; }; } && find . -path './node_modules' -prune -o -path './.git' -prune -o -type f -print | wc -l`,
        { background: false },
      );
    } catch (err) {
      const anyErr = err as any;
      const detail = String(anyErr?.result?.stderr || anyErr?.result?.stdout || anyErr?.stderr || anyErr?.stdout || (err instanceof Error ? err.message : "")).slice(0, 400);
      throw new Error(`Vérification post-clone échouée — ${detail || "détail indisponible"}`);
    }
    if (verify.exitCode !== 0) {
      const detail = String(verify.stdout || verify.stderr || "").slice(0, 400);
      throw new Error(`Import incomplet — ${detail || "package.json ou index.html introuvable"}`);
    }
    const importedFileCount = Number.parseInt((verify.stdout || "0").trim().split("\n").pop() || "0", 10) || 0;

    // 3) Persist GitHub link in project metadata (best-effort)
    try {
      const { data: proj } = await (supabaseAdmin as any)
        .from("projects")
        .select("metadata")
        .eq("id", data.projectId)
        .maybeSingle();
      const meta = (proj?.metadata as Record<string, unknown> | null) ?? {};
      await (supabaseAdmin as any)
        .from("projects")
        .update({
          metadata: {
            ...meta,
            github_repo: {
              owner: data.owner,
              name: data.repo,
              branch: data.branch,
              html_url: `https://github.com/${data.owner}/${data.repo}`,
              linked_at: new Date().toISOString(),
            },
          },
        })
        .eq("id", data.projectId);
    } catch {
      // ignore — l'import a réussi côté sandbox, c'est l'essentiel
    }

    return {
      ok: true,
      cloneExitCode: clone.exitCode,
      installExitCode: 0,
      importedFileCount,
      installLog: "Installation déclenchée par le redémarrage de la preview.",
    };
  });

export const pushGithubChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().min(1).max(120),
        message: z.string().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getConnectionForUser } = await import("@/server/github.server");
    const { runCommand } = await import("@/server/e2b-sandbox.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const conn = await getConnectionForUser(context.userId);
    if (!conn) throw new Error("GitHub non connecté");

    const { data: proj } = await (supabaseAdmin as any)
      .from("projects")
      .select("metadata")
      .eq("id", data.projectId)
      .maybeSingle();
    const ghRepo = ((proj?.metadata as any)?.github_repo ?? null) as {
      owner: string;
      name: string;
      branch: string;
    } | null;
    if (!ghRepo) throw new Error("Aucun repo GitHub lié à ce projet");

    const token = conn.access_token;
    const pushUrl = `https://x-access-token:${token}@github.com/${ghRepo.owner}/${ghRepo.name}.git`;
    const safeMsg = data.message.replace(/'/g, "");
    const safeBranch = ghRepo.branch.replace(/'/g, "");
    const commitEmail = `${conn.github_user_id}+${conn.github_username}@users.noreply.github.com`;

    const cmd = [
      "cd /home/user/app",
      `git config user.email ${shellQuote(commitEmail)}`,
      `git config user.name ${shellQuote(conn.github_username)}`,
      "git add -A",
      `git commit -m '${safeMsg}' || echo 'no-changes'`,
      `git push '${pushUrl}' HEAD:${safeBranch}`,
    ].join(" && ");

    const res = await runCommand(context.userId, data.projectId, cmd, { background: false });
    if (res.exitCode !== 0) {
      const stderr = ((res as any).stderr ?? "").toString();
      throw new Error(`Push échoué: ${stderr.slice(0, 400)}`);
    }
    return {
      ok: true,
      htmlUrl: `https://github.com/${ghRepo.owner}/${ghRepo.name}/tree/${ghRepo.branch}`,
    };
  });
