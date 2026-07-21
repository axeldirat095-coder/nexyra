/**
 * Web + code-intelligence tools for Elena (LOT 4).
 *
 *  - web_read       : URL → Markdown via Jina Reader (clé `jina_api_key`).
 *  - web_search     : recherche Web sémantique via Jina s.jina.ai (clé `jina_api_key`).
 *  - svg_generate   : logo / illustration vectorielle via Recraft V3 (clé `recraft_api_key`).
 *  - github_commit  : push d'un ou plusieurs fichiers dans un repo GitHub
 *                     (clé `github_api_token` — token classic avec scope `repo`).
 *
 * Worker-safe : fetch + JSON, aucun binaire natif.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult, FsMutation } from "./agent-tools.server";

const WEB_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "web_read",
  "svg_generate",
  "github_commit",
]);

export function isWebTool(name: string): boolean {
  return WEB_TOOLS.has(name as ToolName);
}

async function fetchUserKey(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("get_external_key_decrypted", {
    _owner_id: userId,
    _service: service,
  });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): void {
  void supabase
    .rpc("mark_external_key_used", { _owner_id: userId, _service: service })
    .then(() => undefined);
}

// ---------- web_read (Jina Reader) ----------

async function runWebRead(
  args: { url: string; max_chars?: number },
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const target = args.url?.trim();
  if (!target || !/^https?:\/\//i.test(target)) {
    return { ok: false, output: "web_read: `url` http(s) requis." };
  }
  const key = await fetchUserKey(supabase, userId, "jina_api_key");
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "markdown",
  };
  if (key) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetch(`https://r.jina.ai/${target}`, { headers });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `web_read Jina: ${res.status} ${t.slice(0, 200)}` };
    }
    const text = await res.text();
    if (key) markUsed(supabase, userId, "jina_api_key");
    const max = Math.max(500, Math.min(args.max_chars ?? 12000, 30000));
    const out = text.slice(0, max);
    return {
      ok: true,
      output: `🌐 ${target} (${text.length} chars markdown) :\n\n${out}${text.length > max ? "\n\n…(tronqué)" : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `web_read: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- web_search (Jina s.jina.ai) ----------

async function runWebSearch(
  args: { query: string; max_results?: number },
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const q = args.query?.trim();
  if (!q) return { ok: false, output: "web_search: `query` requis." };
  const key = await fetchUserKey(supabase, userId, "jina_api_key");
  if (!key) {
    return {
      ok: false,
      output: "web_search: clé Jina manquante (Réglages → Clés API → Jina).",
    };
  }
  try {
    const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(q)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "X-Respond-With": "no-content",
      },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `web_search Jina: ${res.status} ${t.slice(0, 200)}` };
    }
    const json = (await res.json()) as { data?: Array<{ title?: string; url?: string; description?: string }> };
    markUsed(supabase, userId, "jina_api_key");
    const limit = Math.max(1, Math.min(args.max_results ?? 8, 20));
    const items = (json.data ?? []).slice(0, limit);
    if (items.length === 0) return { ok: true, output: `🔎 Aucun résultat pour : ${q}` };
    const lines = items.map(
      (it, i) => `${i + 1}. ${it.title ?? "(sans titre)"}\n   ${it.url ?? ""}\n   ${(it.description ?? "").slice(0, 200)}`,
    );
    return { ok: true, output: `🔎 ${items.length} résultats pour "${q}" :\n\n${lines.join("\n\n")}` };
  } catch (e) {
    return { ok: false, output: `web_search: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- svg_generate (Recraft V3) ----------

async function runSvgGenerate(
  args: {
    prompt: string;
    style?: string;
    substyle?: string;
    save_path?: string;
  },
  supabase: SupabaseClient<Database>,
  userId: string,
  vfs: Map<string, string> | undefined,
  mutations: FsMutation[],
): Promise<ToolResult> {
  const prompt = args.prompt?.trim();
  if (!prompt) return { ok: false, output: "svg_generate: `prompt` requis." };
  const key = await fetchUserKey(supabase, userId, "recraft_api_key");
  if (!key) {
    return {
      ok: false,
      output: "svg_generate: clé Recraft manquante (Réglages → Clés API → Recraft).",
    };
  }
  // Recraft V3 SVG = style "vector_illustration" (par défaut) ou "icon"/"logo_raster".
  const style = args.style || "vector_illustration";
  try {
    const res = await fetch("https://external.api.recraft.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        style,
        substyle: args.substyle,
        model: "recraftv3",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `svg_generate Recraft: ${res.status} ${t.slice(0, 200)}` };
    }
    const json = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
    const url = json.data?.[0]?.url;
    if (!url) return { ok: false, output: "svg_generate: réponse Recraft vide." };

    // Download and re-host on chat-uploads for stable URL + optional VFS write.
    const dl = await fetch(url);
    const blob = await dl.blob();
    const ext = "svg";
    const ts = Date.now();
    const path = `recraft-svg/${userId}/${ts}.${ext}`;
    const up = await supabase.storage
      .from("chat-uploads")
      .upload(path, blob, { contentType: "image/svg+xml", upsert: false });
    const publicUrl = up.error
      ? url
      : supabase.storage.from("chat-uploads").getPublicUrl(path).data.publicUrl;

    markUsed(supabase, userId, "recraft_api_key");

    // Optional: write into project VFS
    let vfsNote = "";
    if (args.save_path && vfs) {
      const text = await blob.text();
      const safe = args.save_path.replace(/^\/+/, "");
      vfs.set(safe, text);
      mutations.push({ op: "write", path: safe, content: text });
      vfsNote = `\n📁 Sauvegardé dans le projet : \`${safe}\``;
    }

    return {
      ok: true,
      output: `🎨 SVG généré (style: ${style}) : ${publicUrl}${vfsNote}`,
    };
  } catch (e) {
    return { ok: false, output: `svg_generate: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- github_commit ----------

interface GhFile {
  path: string;
  content: string;
}
interface GhArgs {
  repo: string; // "owner/name"
  branch?: string;
  message: string;
  files: GhFile[];
  create_pr?: boolean;
  pr_title?: string;
  pr_body?: string;
}

async function ghFetch(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nexyra-elena",
      ...(init?.headers || {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function b64encode(s: string): string {
  // Worker has btoa; need UTF-8 safe encoding.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function runGithubCommit(
  args: GhArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.repo || !/^[\w.-]+\/[\w.-]+$/.test(args.repo)) {
    return { ok: false, output: "github_commit: `repo` doit être au format `owner/name`." };
  }
  if (!args.message?.trim()) return { ok: false, output: "github_commit: `message` requis." };
  if (!Array.isArray(args.files) || args.files.length === 0) {
    return { ok: false, output: "github_commit: `files` (≥1 fichier) requis." };
  }
  if (args.files.length > 50) {
    return { ok: false, output: "github_commit: max 50 fichiers par commit." };
  }
  const token = await fetchUserKey(supabase, userId, "github_api_token");
  if (!token) {
    return {
      ok: false,
      output: "github_commit: token GitHub manquant (Réglages → Clés API → GitHub).",
    };
  }

  try {
    // 1) detect default branch if not provided
    let branch = args.branch?.trim();
    if (!branch) {
      const r = await ghFetch(token, `/repos/${args.repo}`);
      if (r.status >= 300) {
        return { ok: false, output: `github_commit: repo introuvable (${r.status}).` };
      }
      branch = (r.body as { default_branch?: string }).default_branch || "main";
    }

    // 2) for each file: get current sha (if any), then PUT contents
    const results: string[] = [];
    for (const f of args.files) {
      const path = f.path.replace(/^\/+/, "");
      const get = await ghFetch(
        token,
        `/repos/${args.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      );
      const sha =
        get.status === 200
          ? (get.body as { sha?: string }).sha
          : undefined;
      const put = await ghFetch(
        token,
        `/repos/${args.repo}/contents/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: args.message,
            content: b64encode(f.content),
            branch,
            sha,
          }),
        },
      );
      if (put.status >= 300) {
        const err = (put.body as { message?: string }).message ?? "erreur inconnue";
        results.push(`❌ ${path} : ${put.status} ${err}`);
      } else {
        results.push(`✅ ${path} (${sha ? "update" : "create"})`);
      }
    }

    let prLine = "";
    if (args.create_pr) {
      // Create PR from `branch` → default branch (only if branch != default)
      const repoInfo = await ghFetch(token, `/repos/${args.repo}`);
      const base =
        (repoInfo.body as { default_branch?: string }).default_branch || "main";
      if (base === branch) {
        prLine = "\nℹ️ PR ignorée (branche = défaut).";
      } else {
        const pr = await ghFetch(token, `/repos/${args.repo}/pulls`, {
          method: "POST",
          body: JSON.stringify({
            title: args.pr_title || args.message,
            body: args.pr_body || "PR générée par Elena (Nexyra).",
            head: branch,
            base,
          }),
        });
        if (pr.status >= 300) {
          const m = (pr.body as { message?: string }).message ?? "erreur";
          prLine = `\n⚠️ PR non créée : ${pr.status} ${m}`;
        } else {
          const url = (pr.body as { html_url?: string }).html_url;
          prLine = `\n🔀 PR ouverte : ${url}`;
        }
      }
    }

    markUsed(supabase, userId, "github_api_token");
    return {
      ok: true,
      output: `🐙 GitHub ${args.repo}@${branch} — ${args.files.length} fichier(s) :\n${results.join("\n")}${prLine}`,
    };
  } catch (e) {
    return { ok: false, output: `github_commit: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeWebTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
  vfs?: Map<string, string>,
  mutations?: FsMutation[],
): Promise<ToolResult | null> {
  if (!isWebTool(name)) return null;
  try {
    if (name === "web_read")
      return await runWebRead(rawArgs as { url: string; max_chars?: number }, supabase, userId);
    if (name === "svg_generate")
      return await runSvgGenerate(
        rawArgs as { prompt: string; style?: string; substyle?: string; save_path?: string },
        supabase,
        userId,
        vfs,
        mutations ?? [],
      );
    if (name === "github_commit")
      return await runGithubCommit(rawArgs as unknown as GhArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}

// Keep runWebSearch unused-export-safe by re-exporting nothing; helper is dead code now.
void runWebSearch;
