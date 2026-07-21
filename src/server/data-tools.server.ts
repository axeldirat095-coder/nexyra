/**
 * Data & document tools for Elena (LOT 2).
 *
 * - data_inspect       : analyse rapide d'un CSV / JSON présent dans le VFS.
 * - document_parse     : parse PDF / DOCX via LlamaParse Cloud (BYOK clé user).
 * - preview_console_logs : lit les derniers logs console capturés depuis la sandbox.
 *
 * Le routage Worker exclut tout package natif (sharp, pdf-parse, mammoth) :
 * on reste en parsing JS pur + appel HTTP pour les formats binaires.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const DATA_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "data_inspect",
  "document_parse",
  "preview_console_logs",
]);

export function isDataTool(name: string): boolean {
  return DATA_TOOLS.has(name as ToolName);
}

// ---------- data_inspect ----------

interface InspectArgs {
  path: string;
  rows_preview?: number;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function inspectCsv(content: string, preview: number): string {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return "CSV vide";
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  const sampleRows = rows.slice(0, preview);
  const types: Record<string, string> = {};
  for (const h of headers) {
    const vals = rows.slice(0, 50).map((r) => r[headers.indexOf(h)] ?? "");
    types[h] = vals.every((v) => v === "" || /^-?\d+(\.\d+)?$/.test(v))
      ? "number"
      : vals.every((v) => v === "" || /^(true|false)$/i.test(v))
        ? "boolean"
        : "string";
  }
  return [
    `📊 CSV — ${rows.length} lignes × ${headers.length} colonnes`,
    `Colonnes : ${headers.map((h) => `${h} (${types[h]})`).join(", ")}`,
    `Aperçu (${sampleRows.length} lignes) :`,
    ...sampleRows.map((r, i) => `  ${i + 1}. ${headers.map((h, j) => `${h}=${r[j] ?? ""}`).join(" | ")}`),
  ].join("\n");
}

function inspectJson(content: string, preview: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return `❌ JSON invalide : ${e instanceof Error ? e.message : "parse error"}`;
  }
  if (Array.isArray(parsed)) {
    const sample = parsed.slice(0, preview);
    const keys = parsed[0] && typeof parsed[0] === "object" && !Array.isArray(parsed[0])
      ? Object.keys(parsed[0] as object)
      : [];
    return [
      `📦 JSON Array — ${parsed.length} éléments${keys.length ? ` (clés : ${keys.join(", ")})` : ""}`,
      `Aperçu : ${JSON.stringify(sample, null, 2).slice(0, 2000)}`,
    ].join("\n");
  }
  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed);
    return [
      `📦 JSON Object — ${keys.length} clés racine`,
      `Clés : ${keys.join(", ")}`,
      `Aperçu : ${JSON.stringify(parsed, null, 2).slice(0, 2000)}`,
    ].join("\n");
  }
  return `📦 JSON valeur scalaire : ${JSON.stringify(parsed)}`;
}

async function runDataInspect(
  args: InspectArgs,
  vfs?: Map<string, string>,
): Promise<ToolResult> {
  const path = args.path?.trim();
  if (!path) return { ok: false, output: "data_inspect: path requis" };
  const preview = Math.max(1, Math.min(args.rows_preview ?? 5, 20));
  const content = vfs?.get(path);
  if (content == null) {
    return { ok: false, output: `data_inspect: fichier introuvable dans le VFS (${path})` };
  }
  const lower = path.toLowerCase();
  if (lower.endsWith(".csv")) return { ok: true, output: inspectCsv(content, preview) };
  if (lower.endsWith(".json")) return { ok: true, output: inspectJson(content, preview) };
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return {
      ok: false,
      output:
        "data_inspect: XLSX non supporté côté serveur Worker. Convertis en CSV ou JSON, ou utilise document_parse pour extraire le contenu textuel.",
    };
  }
  return {
    ok: false,
    output: `data_inspect: extension non gérée pour ${path}. Formats : .csv, .json`,
  };
}

// ---------- document_parse (LlamaParse Cloud) ----------

interface ParseArgs {
  source_url?: string;
  path?: string;
  language?: string;
}

const LLAMAPARSE_BASE = "https://api.cloud.llamaindex.ai/api/v1/parsing";

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

async function runDocumentParse(
  args: ParseArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = args.source_url?.trim();
  if (!url) {
    return {
      ok: false,
      output:
        "document_parse: source_url requis (URL publique du PDF / DOCX). Le parsing depuis le VFS n'est pas encore branché.",
    };
  }
  const key = await fetchUserKey(supabase, userId, "llamaparse");
  if (!key) {
    return {
      ok: false,
      output:
        "document_parse: clé LlamaParse manquante. Ajoute-la dans Réglages → Clés API → LlamaParse.",
    };
  }
  try {
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return { ok: false, output: `document_parse: download échoué (${fileRes.status})` };
    }
    const blob = await fileRes.blob();
    const filename = url.split("/").pop()?.split("?")[0] || "document";
    const form = new FormData();
    form.append("file", blob, filename);
    if (args.language) form.append("language", args.language);

    const upload = await fetch(`${LLAMAPARSE_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!upload.ok) {
      const t = await upload.text().catch(() => "");
      return { ok: false, output: `document_parse upload: ${upload.status} ${t.slice(0, 200)}` };
    }
    const { id: jobId } = (await upload.json()) as { id: string };

    // Poll up to ~60s
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      await new Promise((r) => setTimeout(r, 2_000));
      const status = await fetch(`${LLAMAPARSE_BASE}/job/${jobId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const sj = (await status.json().catch(() => ({}))) as { status?: string };
      if (sj.status === "SUCCESS") break;
      if (sj.status === "ERROR") {
        return { ok: false, output: "document_parse: LlamaParse a échoué côté serveur." };
      }
    }
    const md = await fetch(`${LLAMAPARSE_BASE}/job/${jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!md.ok) {
      return { ok: false, output: `document_parse result: ${md.status}` };
    }
    const json = (await md.json()) as { markdown?: string };
    const text = json.markdown ?? "";
    void supabase
      .rpc("mark_external_key_used", { _owner_id: userId, _service: "llamaparse" })
      .then(() => undefined);
    return {
      ok: true,
      output: `📄 Document parsé (${text.length} chars markdown). Aperçu :\n\n${text.slice(0, 4000)}${text.length > 4000 ? "\n\n…(tronqué)" : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `document_parse: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- preview_console_logs ----------

interface LogsArgs {
  project_id?: string;
  level?: "log" | "warn" | "error" | "all";
  limit?: number;
}

async function runPreviewConsoleLogs(
  args: LogsArgs,
  supabase: SupabaseClient<Database>,
  fallbackProjectId: string | null,
): Promise<ToolResult> {
  const projectId = args.project_id ?? fallbackProjectId;
  if (!projectId) {
    return { ok: false, output: "preview_console_logs: project_id requis" };
  }
  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
  let q = supabase
    .from("sandbox_console_logs")
    .select("level, message, created_at, source")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.level && args.level !== "all") q = q.eq("level", args.level);
  const { data, error } = await q;
  if (error) return { ok: false, output: `preview_console_logs: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: true, output: "📭 Aucun log console capturé pour ce projet." };
  }
  const lines = data
    .reverse()
    .map(
      (r) =>
        `[${new Date(r.created_at).toISOString().slice(11, 19)}] ${r.level.toUpperCase()} ${r.source ?? ""} — ${r.message}`,
    );
  return { ok: true, output: `🪵 ${data.length} logs console :\n${lines.join("\n")}` };
}

// ---------- entrypoint ----------

export async function executeDataTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  projectId: string | null,
  userId: string,
  vfs?: Map<string, string>,
): Promise<ToolResult | null> {
  if (!isDataTool(name)) return null;
  try {
    if (name === "data_inspect")
      return await runDataInspect(rawArgs as unknown as InspectArgs, vfs);
    if (name === "document_parse")
      return await runDocumentParse(rawArgs as unknown as ParseArgs, supabase, userId);
    if (name === "preview_console_logs")
      return await runPreviewConsoleLogs(rawArgs as unknown as LogsArgs, supabase, projectId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
