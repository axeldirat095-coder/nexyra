/**
 * LOT 18 — Observabilité runtime preview
 *
 * Tool exposé à Elena :
 *   - preview_network_inspect : lit les requêtes réseau capturées dans la sandbox
 *     (interception fetch + XHR injectée par buildSandboxDoc, persistées dans
 *     `preview_network_logs` côté owner).
 */
import type { ToolResult } from "./agent-tools.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT18_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "preview_network_inspect",
      description:
        "Inspecte les requêtes réseau live de la preview sandbox (fetch + XHR). Filtre par status (ex 4xx/5xx), substring d'URL, méthode, fenêtre temporelle. Idéal pour auto-debug post-génération.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Filtrer par projet (uuid)." },
          status_min: { type: "number", description: "Statut HTTP minimum (ex 400 pour erreurs)." },
          status_max: { type: "number" },
          method: { type: "string", description: "GET/POST/... (optionnel)." },
          url_contains: { type: "string", description: "Sous-chaîne à chercher dans l'URL." },
          since_minutes: { type: "number", description: "Fenêtre rétroactive en minutes (défaut 15)." },
          limit: { type: "number", description: "Max 50 (défaut 20)." },
          only_errors: { type: "boolean", description: "Raccourci pour status>=400 ou error non null." },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

interface NetRow {
  method: string;
  url: string;
  status: number | null;
  duration_ms: number | null;
  error: string | null;
  initiator: string | null;
  created_at: string;
}

export async function executeLot18Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  userId: string,
): Promise<ToolResult | null> {
  if (name !== "preview_network_inspect") return null;
  if (!userId) return { ok: false, output: "preview_network_inspect: auth requise" };
  const sb = supabaseClient as SupabaseLike;

  const sinceMin = Math.max(1, Math.min(1440, Number(rawArgs.since_minutes ?? 15)));
  const limit = Math.max(1, Math.min(50, Number(rawArgs.limit ?? 20)));
  const since = new Date(Date.now() - sinceMin * 60_000).toISOString();

  let q = sb
    .from("preview_network_logs")
    .select("method, url, status, duration_ms, error, initiator, created_at")
    .eq("owner_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (rawArgs.project_id) q = q.eq("project_id", String(rawArgs.project_id));
  if (rawArgs.method) q = q.eq("method", String(rawArgs.method).toUpperCase());
  if (rawArgs.url_contains) q = q.ilike("url", `%${String(rawArgs.url_contains)}%`);
  if (rawArgs.only_errors) q = q.or("status.gte.400,error.not.is.null");
  else {
    if (typeof rawArgs.status_min === "number") q = q.gte("status", rawArgs.status_min);
    if (typeof rawArgs.status_max === "number") q = q.lte("status", rawArgs.status_max);
  }

  const { data, error } = await q;
  if (error) return { ok: false, output: `preview_network_inspect: ${error.message}` };
  const rows = (data ?? []) as NetRow[];
  if (rows.length === 0) {
    return {
      ok: true,
      output: `Aucune requête réseau capturée (fenêtre ${sinceMin} min). Si la preview tourne, ouvre-la et déclenche une action pour générer du trafic.`,
    };
  }

  const lines = rows.map((r) => {
    const st = r.error ? `ERR(${r.error.slice(0, 60)})` : r.status ?? "—";
    const ms = r.duration_ms != null ? `${r.duration_ms}ms` : "—";
    return `• [${st}] ${r.method} ${r.url.slice(0, 120)} · ${ms}${r.initiator ? ` · ${r.initiator}` : ""}`;
  });
  const errCount = rows.filter((r) => (r.status ?? 0) >= 400 || r.error).length;
  return {
    ok: true,
    output: `${rows.length} requête(s) — ${errCount} en erreur (fenêtre ${sinceMin} min) :\n${lines.join("\n")}`,
  };
}
