/**
 * LOT INT-3 — Client MCP Streamable HTTP universel embarqué.
 *
 * Permet à Elena de se brancher à n'importe quel serveur MCP (Model Context Protocol)
 * fourni par l'utilisateur (Notion, Linear, Sentry, custom…), de lister ses tools
 * et de les exécuter via JSON-RPC 2.0 sur transport Streamable HTTP.
 *
 * 4 tools exposés :
 *   - mcp_connect        : enregistre un serveur + handshake (initialize + tools/list)
 *   - mcp_list_servers   : vue projet (status, tools_count)
 *   - mcp_list_tools     : retourne les schémas exposés par un serveur connecté
 *   - mcp_call           : exécute un tool MCP via tools/call
 *
 * Sécurité : anti-SSRF basique, timeout 25s, payload max 64KB, réponse tronquée 8KB,
 * jeton stocké dans une table dédiée (project_mcp_tokens) jamais renvoyé au modèle.
 */

import type { ToolResult } from "./agent-tools.server";

// =====================================================
// SCHÉMAS OPENAI
// =====================================================

export const MCP_TOOLS = [
  {
    type: "function",
    function: {
      name: "mcp_connect",
      description:
        "Enregistre un serveur MCP (Model Context Protocol) sur le projet courant et effectue le handshake (initialize + tools/list). Utilise dès que l'utilisateur fournit une URL MCP (ex: 'connecte ce MCP : https://mcp.notion.com/v1'). Auth : 'none' (public), 'bearer' (token Bearer), ou 'header' (header custom). Retourne le nombre de tools exposés et leurs noms.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom court unique pour ce serveur (ex: 'notion', 'linear-prod')." },
          url: { type: "string", description: "URL Streamable HTTP du serveur MCP (ex: https://mcp.notion.com/v1)." },
          auth_kind: {
            type: "string",
            enum: ["none", "bearer", "header"],
            description: "Type d'auth. Défaut: none.",
          },
          token: { type: "string", description: "Token (pour bearer/header). Stocké chiffré, jamais retourné." },
          auth_header_name: {
            type: "string",
            description: "Nom du header custom (pour auth_kind=header, ex: 'X-API-Key').",
          },
        },
        required: ["name", "url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcp_list_servers",
      description:
        "Liste les serveurs MCP enregistrés sur le projet courant (nom, URL, statut, nombre de tools).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "mcp_list_tools",
      description:
        "Retourne les tools exposés par un serveur MCP connecté (nom, description, schéma d'arguments). À utiliser avant mcp_call pour découvrir les capabilities.",
      parameters: {
        type: "object",
        properties: { server: { type: "string", description: "Nom du serveur MCP (donné lors de mcp_connect)." } },
        required: ["server"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcp_call",
      description:
        "Exécute un tool exposé par un serveur MCP connecté (JSON-RPC tools/call). Retourne le résultat brut tronqué à 8KB.",
      parameters: {
        type: "object",
        properties: {
          server: { type: "string", description: "Nom du serveur MCP." },
          tool: { type: "string", description: "Nom du tool MCP à appeler." },
          arguments: { type: "object", description: "Arguments du tool (JSON).", additionalProperties: true },
        },
        required: ["server", "tool"],
        additionalProperties: false,
      },
    },
  },
] as const;

// =====================================================
// CLIENT MCP STREAMABLE HTTP
// =====================================================

interface UISignal {
  kind: string;
  payload: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

interface ServerRow {
  id: string;
  name: string;
  url: string;
  auth_kind: "none" | "bearer" | "header";
  auth_header_name: string | null;
  status: string;
  tools_count: number;
  last_tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  last_error: string | null;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" || h === "0.0.0.0" ||
    h.startsWith("127.") || h.startsWith("10.") ||
    h.startsWith("192.168.") || h.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
    h.endsWith(".internal") || h.endsWith(".local")
  );
}

function truncate(text: string, max = 8000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[…tronqué — ${text.length - max} chars]`;
}

/**
 * Appel JSON-RPC 2.0 sur transport MCP Streamable HTTP.
 * Spec exige Accept: application/json, text/event-stream — sinon 406.
 */
async function mcpRpc(opts: {
  url: string;
  authKind: "none" | "bearer" | "header";
  token: string | null;
  authHeaderName: string | null;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string | null;
}): Promise<{ ok: boolean; result?: unknown; error?: string; sessionId?: string | null; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": "Nexyra-Elena-MCP/1.0",
  };
  if (opts.authKind === "bearer" && opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.authKind === "header" && opts.token && opts.authHeaderName) headers[opts.authHeaderName] = opts.token;
  if (opts.sessionId) headers["Mcp-Session-Id"] = opts.sessionId;

  const payload = {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1e9),
    method: opts.method,
    params: opts.params ?? {},
  };
  const body = JSON.stringify(payload);
  if (body.length > 64_000) return { ok: false, error: "payload >64KB", status: 0 };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  let resp: Response;
  try {
    resp = await fetch(opts.url, { method: "POST", headers, body, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: `network: ${e instanceof Error ? e.message : String(e)}`, status: 0 };
  }
  clearTimeout(t);

  const newSession = resp.headers.get("Mcp-Session-Id");
  const ctype = resp.headers.get("content-type") ?? "";
  const text = (await resp.text()).slice(0, 256_000);

  if (!resp.ok) {
    return { ok: false, error: `HTTP ${resp.status}: ${truncate(text, 600)}`, status: resp.status, sessionId: newSession };
  }

  // Parse JSON ou SSE ; on prend le 1er event "data:" qui contient la réponse JSON-RPC
  let json: { result?: unknown; error?: { message?: string } } | null = null;
  if (ctype.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      const m = line.match(/^data:\s*(.+)$/);
      if (m) {
        try {
          json = JSON.parse(m[1]);
          if (json && (json.result !== undefined || json.error)) break;
        } catch { /* skip */ }
      }
    }
  } else {
    try { json = JSON.parse(text); } catch { /* fall through */ }
  }

  if (!json) return { ok: false, error: `réponse non-JSON: ${truncate(text, 400)}`, status: resp.status, sessionId: newSession };
  if (json.error) return { ok: false, error: json.error.message ?? "erreur JSON-RPC", status: resp.status, sessionId: newSession };
  return { ok: true, result: json.result, status: resp.status, sessionId: newSession };
}

// =====================================================
// EXECUTOR
// =====================================================

export async function executeMcpTool(
  name: string,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  projectId: string | null,
  uiSignals: UISignal[],
): Promise<ToolResult | null> {
  const sb = supabaseClient as SupabaseLike;

  try {
    if (!["mcp_connect", "mcp_list_servers", "mcp_list_tools", "mcp_call"].includes(name)) return null;
    if (!projectId) return { ok: false, output: `${name} : project_id requis (ouvre un projet d'abord).` };

    // -------- mcp_list_servers --------
    if (name === "mcp_list_servers") {
      const { data, error } = await sb
        .from("project_mcp_servers")
        .select("name, url, auth_kind, status, tools_count, last_error")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) return { ok: false, output: `mcp_list_servers: ${error.message}` };
      if (!data || data.length === 0) return { ok: true, output: "Aucun serveur MCP enregistré sur ce projet." };
      const lines = data.map((s: ServerRow) =>
        `• ${s.name} → ${s.url} [${s.status}] auth=${s.auth_kind} tools=${s.tools_count}${s.last_error ? ` ⚠ ${s.last_error}` : ""}`,
      );
      return { ok: true, output: `${data.length} serveur(s) MCP :\n${lines.join("\n")}` };
    }

    // -------- mcp_connect --------
    if (name === "mcp_connect") {
      const serverName = String(rawArgs.name ?? "").trim().toLowerCase().slice(0, 60);
      const url = String(rawArgs.url ?? "").trim();
      const authKindRaw = String(rawArgs.auth_kind ?? "none").trim();
      const authKind: "none" | "bearer" | "header" =
        authKindRaw === "bearer" || authKindRaw === "header" ? authKindRaw : "none";
      const token = rawArgs.token ? String(rawArgs.token) : null;
      const authHeaderName = rawArgs.auth_header_name ? String(rawArgs.auth_header_name) : null;

      if (!serverName || !/^[a-z0-9-]+$/.test(serverName))
        return { ok: false, output: "name invalide (a-z, 0-9, -)" };
      if (!/^https?:\/\//i.test(url)) return { ok: false, output: "url doit être http(s)://" };
      try {
        const u = new URL(url);
        if (isPrivateHost(u.hostname)) return { ok: false, output: `Host bloqué (réseau privé): ${u.hostname}` };
      } catch { return { ok: false, output: "URL invalide" }; }
      if (authKind !== "none" && !token) return { ok: false, output: `auth_kind=${authKind} requiert token` };
      if (authKind === "header" && !authHeaderName) return { ok: false, output: "auth_kind=header requiert auth_header_name" };

      // Récup user id (owner)
      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return { ok: false, output: "Auth requise" };

      // 1) initialize
      const init = await mcpRpc({
        url, authKind, token, authHeaderName,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "Nexyra-Elena", version: "1.0" },
        },
      });
      if (!init.ok) return { ok: false, output: `MCP initialize failed: ${init.error}` };
      const sessionId = init.sessionId ?? null;

      // 2) tools/list
      const list = await mcpRpc({
        url, authKind, token, authHeaderName, sessionId,
        method: "tools/list",
      });
      if (!list.ok) return { ok: false, output: `MCP tools/list failed: ${list.error}` };
      const toolsArr = ((list.result as { tools?: unknown[] })?.tools ?? []) as Array<{ name: string; description?: string; inputSchema?: unknown }>;

      // 3) Upsert serveur
      const upsertRow = {
        project_id: projectId,
        owner_id: userId,
        name: serverName,
        url,
        auth_kind: authKind,
        auth_header_name: authHeaderName,
        status: "active",
        last_error: null,
        last_tools: toolsArr.slice(0, 80),
        tools_count: toolsArr.length,
        last_checked_at: new Date().toISOString(),
      };
      const { data: srv, error: upErr } = await sb
        .from("project_mcp_servers")
        .upsert(upsertRow, { onConflict: "project_id,name" })
        .select("id")
        .maybeSingle();
      if (upErr || !srv) return { ok: false, output: `DB upsert: ${upErr?.message ?? "no row"}` };

      // 4) Token isolé (chiffré côté DB via RPC)
      if (token) {
        const { error: tkErr } = await (sb.rpc as any)("set_mcp_token", {
          _server_id: srv.id,
          _token: token,
        });
        if (tkErr) return { ok: false, output: `token store: ${tkErr.message}` };
      }

      uiSignals.push({ kind: "mcp_connected", payload: { server: serverName, tools_count: toolsArr.length } });

      const preview = toolsArr.slice(0, 8).map((t) => `  - ${t.name}`).join("\n");
      return {
        ok: true,
        output: `✅ MCP '${serverName}' connecté (${toolsArr.length} tools)\n${preview}${toolsArr.length > 8 ? `\n  … +${toolsArr.length - 8}` : ""}`,
      };
    }

    // -------- mcp_list_tools --------
    if (name === "mcp_list_tools") {
      const serverName = String(rawArgs.server ?? "").trim().toLowerCase();
      const { data: srv, error } = await sb
        .from("project_mcp_servers")
        .select("last_tools, tools_count")
        .eq("project_id", projectId)
        .eq("name", serverName)
        .maybeSingle();
      if (error || !srv) return { ok: false, output: `Serveur MCP '${serverName}' introuvable.` };
      const tools = (srv.last_tools ?? []) as Array<{ name: string; description?: string; inputSchema?: unknown }>;
      const out = tools
        .map((t) => `• ${t.name} — ${t.description ?? ""}\n  args: ${JSON.stringify(t.inputSchema ?? {}).slice(0, 400)}`)
        .join("\n");
      return { ok: true, output: `${tools.length} tools sur '${serverName}':\n${out || "(vide)"}` };
    }

    // -------- mcp_call --------
    if (name === "mcp_call") {
      const serverName = String(rawArgs.server ?? "").trim().toLowerCase();
      const toolName = String(rawArgs.tool ?? "").trim();
      const args = (rawArgs.arguments as Record<string, unknown>) ?? {};
      if (!toolName) return { ok: false, output: "tool requis" };

      const { data: srv, error } = await sb
        .from("project_mcp_servers")
        .select("id, url, auth_kind, auth_header_name")
        .eq("project_id", projectId)
        .eq("name", serverName)
        .maybeSingle();
      if (error || !srv) return { ok: false, output: `Serveur MCP '${serverName}' introuvable.` };

      let token: string | null = null;
      if (srv.auth_kind !== "none") {
        const { data: tk, error: tkErr } = await (sb.rpc as any)("get_mcp_token_decrypted", {
          _server_id: srv.id,
        });
        if (tkErr) return { ok: false, output: `token read: ${tkErr.message}` };
        token = (tk as string | null) ?? null;
        if (!token) return { ok: false, output: `Token absent pour '${serverName}' — relance mcp_connect.` };
      }

      const res = await mcpRpc({
        url: srv.url,
        authKind: srv.auth_kind,
        token,
        authHeaderName: srv.auth_header_name,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      });

      uiSignals.push({
        kind: "mcp_call",
        payload: { server: serverName, tool: toolName, ok: res.ok, status: res.status },
      });

      if (!res.ok) return { ok: false, output: `❌ ${serverName}.${toolName}: ${res.error}` };
      const txt = JSON.stringify(res.result, null, 2);
      return { ok: true, output: `✅ ${serverName}.${toolName}\n${truncate(txt, 8000)}` };
    }

    return null;
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "mcp tool error" };
  }
}
