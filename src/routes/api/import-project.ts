/**
 * Import projet externe (ZIP ou tarball GitHub) → indexation dans project_docs.
 *
 * Body :
 *   - { kind: "zip", base64: string, project_id, org_id, source_label?: string }
 *   - { kind: "github", url: string, project_id, org_id }
 *
 * Stratégie économe :
 *  - Décompresse côté serveur (JSZip déjà en deps client mais on le réutilise via dynamic import).
 *  - Sélectionne 30 fichiers max parmi ceux qui comptent (entries, README, configs, src/components & src/routes principaux).
 *  - Tronque chaque fichier à 4000 chars.
 *  - Insère 1 doc par fichier dans project_docs (pas d'embedding ici — fait à la demande par embed-doc).
 *  - Insère aussi 1 doc "STRUCTURE" listant l'arborescence complète.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateEmbeddingsBatch, toPgVector } from "@/server/embeddings.server";

interface ImportZipBody {
  kind: "zip";
  base64: string;
  project_id: string;
  org_id: string;
  source_label?: string;
}
interface ImportGithubBody {
  kind: "github";
  url: string;
  project_id: string;
  org_id: string;
}
type ImportBody = ImportZipBody | ImportGithubBody;

const KEEP_PATTERNS = [
  /^README/i,
  /^package\.json$/,
  /^vite\.config\./,
  /^tsconfig/,
  /^tailwind/,
  /^next\.config/,
  /^src\/App\.(tsx|jsx)$/,
  /^src\/main\.(tsx|jsx)$/,
  /^src\/router\.(ts|tsx)$/,
  /^src\/routes\/.*\.(tsx?|jsx?)$/,
  /^src\/pages\/.*\.(tsx?|jsx?)$/,
  /^src\/components\/[^/]+\.(tsx?|jsx?)$/, // top-level components only
  /^src\/hooks\/.*\.(tsx?|jsx?)$/,
  /^src\/lib\/.*\.(tsx?|jsx?)$/,
  /^supabase\/migrations\/.*\.sql$/,
];

function shouldKeep(path: string): boolean {
  // Skip node_modules, dist, build, hidden dirs
  if (/(^|\/)(node_modules|dist|build|\.next|\.git|\.cache|coverage)\//.test(path)) return false;
  if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp[34]|webm|pdf|zip|lock)$/i.test(path)) return false;
  return KEEP_PATTERNS.some((re) => re.test(path));
}

const MAX_FILES = 30;
const MAX_CONTENT = 4000;

async function extractZipFiles(base64: string): Promise<Array<{ path: string; content: string }>> {
  const JSZipMod = await import("jszip");
  const JSZip = JSZipMod.default;
  const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(buf);
  const out: Array<{ path: string; content: string }> = [];
  // Collect first → ranking → trim
  const all: Array<{ path: string; entry: import("jszip").JSZipObject }> = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    // strip the top-level folder if all entries share it (common in GitHub tarballs)
    all.push({ path, entry });
  });
  // Strip common top-level folder
  const tops = new Set(all.map((a) => a.path.split("/")[0]));
  const stripTop = tops.size === 1;
  const ranked = all
    .map((a) => ({ ...a, normalized: stripTop ? a.path.split("/").slice(1).join("/") : a.path }))
    .filter((a) => a.normalized && shouldKeep(a.normalized));

  // Always keep README first if present
  ranked.sort((a, b) => {
    const ar = /^README/i.test(a.normalized) ? 0 : 1;
    const br = /^README/i.test(b.normalized) ? 0 : 1;
    return ar - br;
  });

  for (const item of ranked.slice(0, MAX_FILES)) {
    try {
      const text = await item.entry.async("string");
      out.push({ path: item.normalized, content: text.slice(0, MAX_CONTENT) });
    } catch {
      /* skip binary */
    }
  }
  return out;
}

async function fetchGithubTarball(url: string): Promise<string> {
  // Accept :  https://github.com/owner/repo  or  https://github.com/owner/repo/tree/branch
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)(?:\/tree\/([^/?#]+))?/);
  if (!m) throw new Error("URL GitHub invalide. Format attendu : https://github.com/owner/repo");
  const [, owner, repoRaw, branch] = m;
  const repo = repoRaw.replace(/\.git$/, "");
  const ref = branch || "HEAD";
  const tarUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${ref === "HEAD" ? "main" : ref}`;
  let res = await fetch(tarUrl);
  if (!res.ok && ref === "HEAD") {
    // fallback master
    res = await fetch(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/master`);
  }
  if (!res.ok) throw new Error(`GitHub fetch HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export const Route = createFileRoute("/api/import-project")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const token = auth.slice(7);
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userId = claims.claims.sub as string;

        let body: ImportBody;
        try {
          body = (await request.json()) as ImportBody;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (!body.project_id || !body.org_id) {
          return new Response(JSON.stringify({ error: "project_id and org_id required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          let base64: string;
          let sourceLabel: string;
          if (body.kind === "github") {
            base64 = await fetchGithubTarball(body.url);
            sourceLabel = body.url;
          } else if (body.kind === "zip") {
            base64 = body.base64;
            sourceLabel = body.source_label ?? "ZIP upload";
          } else {
            return new Response(JSON.stringify({ error: "kind must be zip or github" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const files = await extractZipFiles(base64);
          if (files.length === 0) {
            return new Response(
              JSON.stringify({ error: "Aucun fichier exploitable trouvé dans le projet." }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Insert STRUCTURE doc
          const structure = files.map((f) => f.path).sort().join("\n");
          const docs = [
            {
              project_id: body.project_id,
              org_id: body.org_id,
              owner_id: userId,
              title: `[Import] STRUCTURE — ${sourceLabel}`,
              content: `Source: ${sourceLabel}\nFichiers indexés (${files.length}/${MAX_FILES} max) :\n\n${structure}`,
              tags: ["import", body.kind, "structure"],
            },
            ...files.map((f) => ({
              project_id: body.project_id,
              org_id: body.org_id,
              owner_id: userId,
              title: `[Import] ${f.path}`,
              content: `Source: ${sourceLabel}\nFichier: ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``,
              tags: ["import", body.kind, f.path.split("/")[0] || "root"],
            })),
          ];

          const { data: insertedDocs, error: insertErr } = await supabase
            .from("project_docs")
            .insert(docs)
            .select("id, title, content");
          if (insertErr) throw insertErr;

          // === Phase 2.2 : batch embeddings (1 appel HTTP pour N docs) ===
          let embedded = 0;
          try {
            const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (insertedDocs && insertedDocs.length > 0 && SUPABASE_SERVICE_ROLE_KEY) {
              const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
                auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
              });
              // Récup clé OpenAI admin (mutualisée)
              const { data: adminRow } = await supabaseAdmin
                .from("user_roles")
                .select("user_id")
                .eq("role", "admin")
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              if (adminRow?.user_id) {
                const { data: keyData } = await supabaseAdmin.rpc("get_api_key_decrypted", {
                  _owner_id: adminRow.user_id,
                  _provider: "openai",
                });
                const apiKey = keyData as string | null;
                if (apiKey) {
                  const texts = insertedDocs.map((d) => `${d.title}\n\n${d.content}`);
                  const vectors = await generateEmbeddingsBatch(texts, apiKey, 20);
                  const now = new Date().toISOString();
                  // Update en parallèle (max 5 à la fois pour ne pas saturer)
                  for (let i = 0; i < insertedDocs.length; i += 5) {
                    const chunk = insertedDocs.slice(i, i + 5).map((doc, j) => {
                      const vec = vectors[i + j];
                      if (!vec) return null;
                      return supabaseAdmin
                        .from("project_docs")
                        .update({
                          embedding: toPgVector(vec) as never,
                          embedding_updated_at: now,
                        })
                        .eq("id", doc.id);
                    });
                    const results = await Promise.all(chunk.filter((x) => x !== null));
                    embedded += results.filter((r) => !r?.error).length;
                  }
                }
              }
            }
          } catch (embedErr) {
            console.warn("batch embed (non-fatal)", embedErr);
          }

          return new Response(
            JSON.stringify({
              ok: true,
              imported: files.length,
              embedded,
              source: sourceLabel,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Import error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
