/**
 * LOT 8 — Outils complémentaires Elena.
 *
 *  - web_screenshot   : capture PNG d'une URL via Firecrawl /scrape (formats:[screenshot]).
 *                       Aucun BYOK requis — utilise FIRECRAWL_API_KEY (connector serveur).
 *  - db_query         : SELECT contraint sur la DB du projet via le client Supabase
 *                       authentifié (RLS appliquée comme l'utilisateur). Filters whitelist,
 *                       limit max 100. Lecture seule.
 *  - replicate_run    : exécute n'importe quel modèle Replicate (clé `replicate_api_token`).
 *                       Crée la prediction, polle ≤60 s, retourne output URL/JSON.
 *  - exa_search       : recherche neurale sémantique via Exa.ai (clé `exa_api_key`).
 *                       Top-k résultats avec snippet et score.
 *
 *  Worker-safe : fetch + JSON. Polling Replicate non bloquant (sleep helpers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT8_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "web_screenshot",
  "db_query",
  "replicate_run",
  "exa_search",
]);

export function isLot8Tool(name: string): boolean {
  return LOT8_TOOLS.has(name as ToolName);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- web_screenshot (Firecrawl) ----------

interface ScreenshotArgs {
  url: string;
  full_page?: boolean;
  wait_for?: number; // ms
}

async function runWebScreenshot(args: ScreenshotArgs): Promise<ToolResult> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, output: "web_screenshot: URL http(s) requise." };
  }
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { ok: false, output: "web_screenshot: FIRECRAWL_API_KEY non configuré (Connecteurs)." };
  }

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: [args.full_page ? "screenshot@fullPage" : "screenshot"],
        waitFor: Math.min(Math.max(args.wait_for ?? 0, 0), 10_000),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      return { ok: false, output: `web_screenshot: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: { screenshot?: string; metadata?: { title?: string } };
    };
    const shot = json.data?.screenshot;
    if (!shot) return { ok: false, output: "web_screenshot: aucun screenshot dans la réponse." };
    return {
      ok: true,
      output: `📸 Screenshot ${url}${json.data?.metadata?.title ? ` — "${json.data.metadata.title}"` : ""}\n${shot}`,
    };
  } catch (e) {
    return { ok: false, output: `web_screenshot: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- db_query (Supabase RLS-safe SELECT) ----------

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in";

interface DbQueryArgs {
  table: string;
  columns?: string; // ex "id,name" — default "*"
  filters?: Array<{ column: string; op: FilterOp; value: unknown }>;
  order_by?: { column: string; ascending?: boolean };
  limit?: number;
}

const SAFE_OPS: ReadonlySet<FilterOp> = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in",
]);

const TABLE_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const COLS_RE = /^[a-zA-Z0-9_,*\s]{1,500}$/;

async function runDbQuery(
  args: DbQueryArgs,
  supabase: SupabaseClient<Database>,
): Promise<ToolResult> {
  const table = String(args.table ?? "").trim();
  if (!TABLE_RE.test(table)) {
    return { ok: false, output: "db_query: nom de table invalide." };
  }
  const columns = String(args.columns ?? "*").trim();
  if (!COLS_RE.test(columns)) {
    return { ok: false, output: "db_query: 'columns' doit être '*' ou liste type 'a,b,c'." };
  }
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase as any).from(table).select(columns);
    for (const f of (args.filters ?? []).slice(0, 10)) {
      if (!SAFE_OPS.has(f.op)) continue;
      if (!TABLE_RE.test(f.column)) continue;
      if (f.op === "in") {
        const arr = Array.isArray(f.value) ? f.value.slice(0, 50) : [f.value];
        q = q.in(f.column, arr);
      } else {
        q = q[f.op](f.column, f.value);
      }
    }
    if (args.order_by && TABLE_RE.test(args.order_by.column)) {
      q = q.order(args.order_by.column, { ascending: args.order_by.ascending !== false });
    }
    q = q.limit(limit);

    const { data, error } = await q;
    if (error) return { ok: false, output: `db_query: ${error.message}` };
    const rows = Array.isArray(data) ? data : [];
    const sample = JSON.stringify(rows, null, 2).slice(0, 6000);
    return {
      ok: true,
      output: `🗄️ ${rows.length} ligne(s) — table "${table}":\n${sample}${sample.length >= 6000 ? "\n[…tronqué]" : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `db_query: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- replicate_run ----------

interface ReplicateArgs {
  model: string; // "owner/name" ou version hash
  version?: string;
  input: Record<string, unknown>;
  timeout_ms?: number;
}

async function runReplicate(
  args: ReplicateArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const model = String(args.model ?? "").trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(model) && !args.version) {
    return { ok: false, output: "replicate_run: 'model' (format owner/name) ou 'version' requis." };
  }
  const apiKey = await fetchUserKey(supabase, userId, "replicate_api_token");
  if (!apiKey) return { ok: false, output: "replicate_run: clé `replicate_api_token` requise." };

  const timeout = Math.min(Math.max(args.timeout_ms ?? 60_000, 5_000), 120_000);
  const deadline = Date.now() + timeout;

  try {
    // 1) Crée la prediction (endpoint "models/<owner>/<name>/predictions" si pas de version)
    const createUrl = args.version
      ? "https://api.replicate.com/v1/predictions"
      : `https://api.replicate.com/v1/models/${model}/predictions`;
    const body = args.version
      ? { version: args.version, input: args.input ?? {} }
      : { input: args.input ?? {} };

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait=10",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!createRes.ok) {
      return { ok: false, output: `replicate_run: création échouée (${createRes.status}) ${(await createRes.text()).slice(0, 300)}` };
    }
    let pred = (await createRes.json()) as {
      id?: string;
      status?: string;
      output?: unknown;
      error?: string;
      urls?: { get?: string };
    };

    // 2) Poll jusqu'à status terminal
    while (pred.status && !["succeeded", "failed", "canceled"].includes(pred.status)) {
      if (Date.now() > deadline) {
        return { ok: false, output: `replicate_run: timeout (${pred.status}). Prediction id ${pred.id}` };
      }
      await sleep(2_000);
      const pollUrl = pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`;
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!pollRes.ok) break;
      pred = (await pollRes.json()) as typeof pred;
    }

    markUsed(supabase, userId, "replicate_api_token");
    if (pred.status !== "succeeded") {
      return { ok: false, output: `replicate_run: ${pred.status ?? "?"} — ${pred.error ?? ""}` };
    }
    const out = JSON.stringify(pred.output, null, 2).slice(0, 4000);
    return { ok: true, output: `🔁 Replicate "${model}" → ${pred.status}:\n${out}` };
  } catch (e) {
    return { ok: false, output: `replicate_run: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- exa_search ----------

interface ExaArgs {
  query: string;
  num_results?: number;
  type?: "neural" | "keyword" | "auto";
  include_text?: boolean;
}

async function runExa(
  args: ExaArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, output: "exa_search: 'query' requis." };

  const apiKey = await fetchUserKey(supabase, userId, "exa_api_key");
  if (!apiKey) return { ok: false, output: "exa_search: clé `exa_api_key` requise." };

  const num = Math.min(Math.max(args.num_results ?? 5, 1), 20);
  const type = args.type ?? "auto";

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults: num,
        type,
        contents: args.include_text ? { text: { maxCharacters: 800 } } : undefined,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, output: `exa_search: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        score?: number;
        text?: string;
        publishedDate?: string;
      }>;
    };
    const items = json.results ?? [];
    if (items.length === 0) return { ok: true, output: "(aucun résultat Exa)" };
    markUsed(supabase, userId, "exa_api_key");

    const formatted = items
      .map((r, i) => {
        const head = `${i + 1}. [${(r.score ?? 0).toFixed(2)}] ${r.title ?? "(sans titre)"}\n   ${r.url ?? ""}`;
        const tail = r.text ? `\n   ${r.text.slice(0, 400).replace(/\n+/g, " ")}` : "";
        return head + tail;
      })
      .join("\n\n");
    return { ok: true, output: `🔮 Exa (${type}) — "${query}":\n\n${formatted}` };
  } catch (e) {
    return { ok: false, output: `exa_search: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot8Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot8Tool(name)) return null;
  try {
    if (name === "web_screenshot")
      return await runWebScreenshot(rawArgs as unknown as ScreenshotArgs);
    if (name === "db_query")
      return await runDbQuery(rawArgs as unknown as DbQueryArgs, supabase);
    if (name === "replicate_run")
      return await runReplicate(rawArgs as unknown as ReplicateArgs, supabase, userId);
    if (name === "exa_search")
      return await runExa(rawArgs as unknown as ExaArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
