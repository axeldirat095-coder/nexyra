/**
 * LOT 16 — Webhooks personnalisés + secret_set
 *
 * Tools exposés à Elena :
 *   - webhook_register : l'utilisateur (via Elena) enregistre une URL webhook réutilisable
 *   - webhook_list     : liste les webhooks de l'utilisateur
 *   - webhook_call     : invoque un webhook enregistré (anti-SSRF, timeout 25s)
 *   - webhook_delete   : retire un webhook
 *   - secret_set       : émet un signal UI demandant à l'utilisateur de saisir une valeur
 *                        secrète via le formulaire sécurisé Lovable Cloud.
 */

import type { ToolResult } from "./agent-tools.server";

interface UISignal {
  kind: string;
  payload: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT16_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "webhook_register",
      description:
        "Enregistre un webhook personnalisé (URL HTTP) comme tool réutilisable par Elena. Utile pour brancher Zapier, Make, n8n, ou un endpoint maison sans repasser par le code.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom court unique (a-z, 0-9, _)." },
          description: { type: "string" },
          url: { type: "string", description: "URL https publique." },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "Défaut POST." },
          auth_kind: { type: "string", enum: ["none", "bearer", "header"] },
          auth_token: { type: "string", description: "Token (stocké, jamais retourné)." },
          auth_header_name: { type: "string", description: "Pour auth_kind=header." },
        },
        required: ["name", "url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "webhook_list",
      description: "Liste les webhooks personnalisés enregistrés par l'utilisateur.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "webhook_call",
      description: "Invoque un webhook enregistré par son nom. Le body JSON est envoyé tel quel.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          body: { type: "object", additionalProperties: true },
          query: { type: "object", additionalProperties: true },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "webhook_delete",
      description: "Supprime un webhook personnalisé.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "secret_set",
      description:
        "Demande à l'utilisateur de définir un secret runtime (clé API, token) via une boîte de dialogue Lovable Cloud sécurisée. Le secret devient ensuite disponible côté backend. À utiliser quand un tool requiert une clé manquante.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom de la variable d'environnement (ex: STRIPE_API_KEY)." },
          reason: { type: "string", description: "Pourquoi ce secret est nécessaire (affiché à l'utilisateur)." },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
] as const;

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

function truncate(text: string, max = 6000): string {
  return text.length <= max ? text : text.slice(0, max) + `\n[…+${text.length - max} chars]`;
}

const NAME_RE = /^[a-z0-9_-]{2,40}$/i;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,60}$/;

export async function executeLot16Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  userId: string,
  uiSignals: UISignal[],
): Promise<ToolResult | null> {
  const sb = supabaseClient as SupabaseLike;
  if (!["webhook_register", "webhook_list", "webhook_call", "webhook_delete", "secret_set"].includes(name)) {
    return null;
  }
  if (!userId) return { ok: false, output: `${name}: auth requise` };

  try {
    if (name === "secret_set") {
      const secretName = String(rawArgs.name ?? "").trim();
      const reason = rawArgs.reason ? String(rawArgs.reason) : null;
      if (!SECRET_NAME_RE.test(secretName)) {
        return { ok: false, output: "secret name invalide (format SCREAMING_SNAKE_CASE, A-Z 0-9 _)" };
      }
      uiSignals.push({ kind: "secret_set_request", payload: { name: secretName, reason } });
      return {
        ok: true,
        output: `🔐 Demande envoyée à l'utilisateur pour définir le secret '${secretName}'. Une fois validé, il sera disponible côté backend.`,
      };
    }

    if (name === "webhook_register") {
      const wname = String(rawArgs.name ?? "").trim();
      const url = String(rawArgs.url ?? "").trim();
      if (!NAME_RE.test(wname)) return { ok: false, output: "name invalide (a-z0-9_-)" };
      if (!/^https?:\/\//i.test(url)) return { ok: false, output: "url doit être http(s)://" };
      try {
        const u = new URL(url);
        if (isPrivateHost(u.hostname)) return { ok: false, output: `Host bloqué (réseau privé): ${u.hostname}` };
      } catch { return { ok: false, output: "URL invalide" }; }

      const method = String(rawArgs.method ?? "POST").toUpperCase();
      const authKindRaw = String(rawArgs.auth_kind ?? "none");
      const authKind = ["none", "bearer", "header"].includes(authKindRaw) ? authKindRaw : "none";
      const authToken = rawArgs.auth_token ? String(rawArgs.auth_token) : null;
      const authHeaderName = rawArgs.auth_header_name ? String(rawArgs.auth_header_name) : null;
      if (authKind !== "none" && !authToken) return { ok: false, output: `auth_kind=${authKind} requiert auth_token` };
      if (authKind === "header" && !authHeaderName) return { ok: false, output: "auth_kind=header requiert auth_header_name" };

      const row = {
        owner_id: userId,
        name: wname,
        description: rawArgs.description ? String(rawArgs.description) : null,
        url,
        method,
        auth_kind: authKind,
        auth_header_name: authHeaderName,
      };
      const { data: upserted, error } = await sb
        .from("webhook_custom_tools")
        .upsert(row, { onConflict: "owner_id,name" })
        .select("id")
        .maybeSingle();
      if (error || !upserted) return { ok: false, output: `webhook_register: ${error?.message ?? "no row"}` };

      // Stockage chiffré du token via RPC (jamais en clair en colonne)
      if (authToken) {
        const { error: tkErr } = await (sb.rpc as any)("set_webhook_auth_token", {
          _webhook_id: upserted.id,
          _token: authToken,
        });
        if (tkErr) return { ok: false, output: `token store: ${tkErr.message}` };
      }
      uiSignals.push({ kind: "webhook_registered", payload: { name: wname, method } });
      return { ok: true, output: `✅ Webhook '${wname}' enregistré (${method} ${url}).` };
    }

    if (name === "webhook_list") {
      const { data, error } = await sb
        .from("webhook_custom_tools")
        .select("name, description, url, method, auth_kind, created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      if (error) return { ok: false, output: `webhook_list: ${error.message}` };
      if (!data || data.length === 0) return { ok: true, output: "Aucun webhook enregistré." };
      const lines = data.map((w: { name: string; method: string; url: string; auth_kind: string; description: string | null }) =>
        `• ${w.name} [${w.method}] ${w.url} auth=${w.auth_kind}${w.description ? ` — ${w.description}` : ""}`,
      );
      return { ok: true, output: `${data.length} webhook(s) :\n${lines.join("\n")}` };
    }

    if (name === "webhook_delete") {
      const wname = String(rawArgs.name ?? "").trim();
      if (!NAME_RE.test(wname)) return { ok: false, output: "name invalide" };
      const { error } = await sb
        .from("webhook_custom_tools")
        .delete()
        .eq("owner_id", userId)
        .eq("name", wname);
      if (error) return { ok: false, output: `webhook_delete: ${error.message}` };
      return { ok: true, output: `🗑️ Webhook '${wname}' supprimé.` };
    }

    if (name === "webhook_call") {
      const wname = String(rawArgs.name ?? "").trim();
      if (!NAME_RE.test(wname)) return { ok: false, output: "name invalide" };
      const { data: hook, error } = await sb
        .from("webhook_custom_tools")
        .select("url, method, auth_kind, auth_header_name")
        .eq("owner_id", userId)
        .eq("name", wname)
        .maybeSingle();
      if (error || !hook) return { ok: false, output: `webhook '${wname}' introuvable` };

      let authToken: string | null = null;
      if (hook.auth_kind !== "none") {
        const { data: tk, error: tkErr } = await (sb.rpc as any)("get_webhook_auth_token_decrypted", {
          _owner_id: userId,
          _name: wname,
        });
        if (tkErr) return { ok: false, output: `token read: ${tkErr.message}` };
        authToken = (tk as string | null) ?? null;
      }

      let url = hook.url as string;
      const query = (rawArgs.query as Record<string, unknown>) ?? {};
      if (Object.keys(query).length > 0) {
        const u = new URL(url);
        for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
        url = u.toString();
      }
      try {
        const u = new URL(url);
        if (isPrivateHost(u.hostname)) return { ok: false, output: `Host bloqué: ${u.hostname}` };
      } catch { return { ok: false, output: "URL invalide" }; }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Nexyra-Elena-Webhook/1.0",
      };
      if (hook.auth_kind === "bearer" && authToken) headers.Authorization = `Bearer ${authToken}`;
      if (hook.auth_kind === "header" && authToken && hook.auth_header_name) {
        headers[hook.auth_header_name] = authToken;
      }

      const method = String(hook.method || "POST").toUpperCase();
      const hasBody = method !== "GET" && method !== "DELETE";
      const body = hasBody ? JSON.stringify(rawArgs.body ?? {}) : undefined;
      if (body && body.length > 64_000) return { ok: false, output: "body >64KB" };

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25_000);
      let resp: Response;
      try {
        resp = await fetch(url, { method, headers, body, signal: ctrl.signal });
      } catch (e) {
        clearTimeout(t);
        return { ok: false, output: `network: ${e instanceof Error ? e.message : String(e)}` };
      }
      clearTimeout(t);

      const text = (await resp.text()).slice(0, 32_000);
      uiSignals.push({ kind: "webhook_call", payload: { name: wname, status: resp.status, ok: resp.ok } });
      return {
        ok: resp.ok,
        output: `${resp.ok ? "✅" : "❌"} ${wname} → HTTP ${resp.status}\n${truncate(text)}`,
      };
    }

    return null;
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "lot16 tool error" };
  }
}
