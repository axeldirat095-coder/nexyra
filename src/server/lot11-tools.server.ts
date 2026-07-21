/**
 * LOT 11 — CRM, scheduling, analytics, messaging, dev-ops.
 *
 *  - hubspot_contact_create : crée/upsert un contact HubSpot (BYOK `hubspot_private_token`).
 *  - calendly_event_types   : liste les event types Calendly de l'utilisateur (BYOK `calendly_api_key`).
 *  - posthog_capture        : envoie un event analytics PostHog (BYOK `posthog_api_key`, opt `posthog_host`).
 *  - slack_send_message     : poste un message dans un canal Slack (BYOK `slack_bot_token`).
 *  - github_pr_create       : ouvre une Pull Request GitHub (BYOK `github_token`).
 *  - vercel_env_set         : ajoute/maj une variable d'env Vercel (BYOK `vercel_api_token`).
 *
 * Worker-safe : fetch + JSON, BYOK strict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT11_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "hubspot_contact_create",
  "calendly_event_types",
  "posthog_capture",
  "slack_send_message",
  "github_pr_create",
  "vercel_env_set",
]);

export function isLot11Tool(name: string): boolean {
  return LOT11_TOOLS.has(name as ToolName);
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

// ---------- hubspot_contact_create ----------

interface HubspotArgs {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  properties?: Record<string, string>;
}

async function runHubspot(
  args: HubspotArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const email = String(args.email ?? "").trim();
  if (!email || !email.includes("@")) {
    return { ok: false, output: "hubspot_contact_create: 'email' valide requis." };
  }
  const token = await fetchUserKey(supabase, userId, "hubspot_private_token");
  if (!token) return { ok: false, output: "hubspot_contact_create: clé `hubspot_private_token` manquante." };

  const properties: Record<string, string> = { email, ...(args.properties || {}) };
  if (args.firstname) properties.firstname = String(args.firstname);
  if (args.lastname) properties.lastname = String(args.lastname);
  if (args.phone) properties.phone = String(args.phone);
  if (args.company) properties.company = String(args.company);

  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      category?: string;
    };
    // 409 = already exists → tente un update via PATCH /by/email
    if (res.status === 409) {
      const upd = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ properties }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const uj = (await upd.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!upd.ok) return { ok: false, output: `hubspot_contact_create: update ${upd.status} ${uj.message ?? ""}` };
      markUsed(supabase, userId, "hubspot_private_token");
      return { ok: true, output: `🟢 Contact HubSpot mis à jour (id ${uj.id}).` };
    }
    if (!res.ok) return { ok: false, output: `hubspot_contact_create: ${res.status} ${json.message ?? ""}` };
    markUsed(supabase, userId, "hubspot_private_token");
    return { ok: true, output: `🟢 Contact HubSpot créé (id ${json.id}).` };
  } catch (e) {
    return { ok: false, output: `hubspot_contact_create: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- calendly_event_types ----------

interface CalendlyArgs {
  active_only?: boolean;
}

async function runCalendly(
  args: CalendlyArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const token = await fetchUserKey(supabase, userId, "calendly_api_key");
  if (!token) return { ok: false, output: "calendly_event_types: clé `calendly_api_key` manquante." };

  try {
    // 1. Récupère l'utilisateur courant
    const me = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!me.ok) {
      return { ok: false, output: `calendly_event_types: /users/me ${me.status}` };
    }
    const meJson = (await me.json()) as { resource?: { uri?: string; name?: string } };
    const userUri = meJson.resource?.uri;
    if (!userUri) return { ok: false, output: "calendly_event_types: utilisateur introuvable." };

    // 2. Liste les event types
    const url = new URL("https://api.calendly.com/event_types");
    url.searchParams.set("user", userUri);
    if (args.active_only !== false) url.searchParams.set("active", "true");
    url.searchParams.set("count", "50");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      collection?: Array<{ name?: string; scheduling_url?: string; duration?: number; active?: boolean }>;
    };
    if (!res.ok) return { ok: false, output: `calendly_event_types: ${res.status}` };
    markUsed(supabase, userId, "calendly_api_key");

    const items = json.collection ?? [];
    if (items.length === 0) return { ok: true, output: "(aucun event type Calendly trouvé)" };
    const formatted = items
      .map(
        (e, i) =>
          `${i + 1}. ${e.name} — ${e.duration ?? "?"}min ${e.active ? "🟢" : "⚪"}\n   ${e.scheduling_url}`,
      )
      .join("\n");
    return { ok: true, output: `📅 ${items.length} event type(s) Calendly :\n\n${formatted}` };
  } catch (e) {
    return { ok: false, output: `calendly_event_types: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- posthog_capture ----------

interface PosthogArgs {
  event: string;
  distinct_id: string;
  properties?: Record<string, unknown>;
  host?: string;
}

async function runPosthog(
  args: PosthogArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const event = String(args.event ?? "").trim();
  const distinctId = String(args.distinct_id ?? "").trim();
  if (!event || !distinctId) {
    return { ok: false, output: "posthog_capture: 'event' et 'distinct_id' requis." };
  }
  const apiKey = await fetchUserKey(supabase, userId, "posthog_api_key");
  if (!apiKey) return { ok: false, output: "posthog_capture: clé `posthog_api_key` manquante." };
  const customHost = args.host || (await fetchUserKey(supabase, userId, "posthog_host"));
  const host = (customHost || "https://us.i.posthog.com").replace(/\/+$/, "");

  try {
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: args.properties || {},
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `posthog_capture: ${res.status} ${t.slice(0, 200)}` };
    }
    markUsed(supabase, userId, "posthog_api_key");
    return { ok: true, output: `📊 Event PostHog '${event}' envoyé (user ${distinctId}).` };
  } catch (e) {
    return { ok: false, output: `posthog_capture: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- slack_send_message ----------

interface SlackArgs {
  channel: string; // ID (C...) ou #nom
  text: string;
  thread_ts?: string;
  blocks?: unknown[];
}

async function runSlack(
  args: SlackArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const channel = String(args.channel ?? "").trim();
  const text = String(args.text ?? "").trim();
  if (!channel || !text) return { ok: false, output: "slack_send_message: 'channel' et 'text' requis." };
  const token = await fetchUserKey(supabase, userId, "slack_bot_token");
  if (!token) return { ok: false, output: "slack_send_message: clé `slack_bot_token` (xoxb-...) manquante." };

  const body: Record<string, unknown> = { channel, text: text.slice(0, 3500) };
  if (args.thread_ts) body.thread_ts = String(args.thread_ts);
  if (Array.isArray(args.blocks)) body.blocks = args.blocks;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string };
    if (!json.ok) return { ok: false, output: `slack_send_message: ${json.error ?? `HTTP ${res.status}`}` };
    markUsed(supabase, userId, "slack_bot_token");
    return { ok: true, output: `💬 Message Slack envoyé sur ${channel} (ts ${json.ts}).` };
  } catch (e) {
    return { ok: false, output: `slack_send_message: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- github_pr_create ----------

interface GithubPrArgs {
  repo: string; // owner/name
  title: string;
  head: string; // branche source
  base: string; // branche cible (ex main)
  body?: string;
  draft?: boolean;
}

async function runGithubPr(
  args: GithubPrArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const repo = String(args.repo ?? "").trim();
  const title = String(args.title ?? "").trim();
  const head = String(args.head ?? "").trim();
  const base = String(args.base ?? "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !title || !head || !base) {
    return { ok: false, output: "github_pr_create: repo (owner/name), title, head, base requis." };
  }
  const token = await fetchUserKey(supabase, userId, "github_token");
  if (!token) return { ok: false, output: "github_pr_create: clé `github_token` manquante." };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        head,
        base,
        body: args.body ? String(args.body).slice(0, 10_000) : undefined,
        draft: args.draft === true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      number?: number;
      html_url?: string;
      message?: string;
      errors?: Array<{ message?: string }>;
    };
    if (!res.ok) {
      const errs = json.errors?.map((e) => e.message).join("; ");
      return { ok: false, output: `github_pr_create: ${res.status} ${json.message ?? ""} ${errs ?? ""}` };
    }
    markUsed(supabase, userId, "github_token");
    return { ok: true, output: `🔀 PR #${json.number} ouverte : ${json.html_url}` };
  } catch (e) {
    return { ok: false, output: `github_pr_create: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- vercel_env_set ----------

interface VercelEnvArgs {
  project_id: string;
  key: string;
  value: string;
  target?: Array<"production" | "preview" | "development">;
  type?: "encrypted" | "plain";
  team_id?: string;
}

async function runVercelEnv(
  args: VercelEnvArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const projectId = String(args.project_id ?? "").trim();
  const key = String(args.key ?? "").trim();
  const value = String(args.value ?? "");
  if (!projectId || !key || !value) {
    return { ok: false, output: "vercel_env_set: project_id, key, value requis." };
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    return { ok: false, output: "vercel_env_set: 'key' doit être en MAJUSCULES_AVEC_UNDERSCORES." };
  }
  const token = await fetchUserKey(supabase, userId, "vercel_api_token");
  if (!token) return { ok: false, output: "vercel_env_set: clé `vercel_api_token` manquante." };

  const target = Array.isArray(args.target) && args.target.length > 0
    ? args.target
    : ["production", "preview", "development"];

  try {
    const url = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
    url.searchParams.set("upsert", "true");
    if (args.team_id) url.searchParams.set("teamId", args.team_id);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        value,
        type: args.type ?? "encrypted",
        target,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      key?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, output: `vercel_env_set: ${res.status} ${json.error?.message ?? ""}` };
    }
    markUsed(supabase, userId, "vercel_api_token");
    return { ok: true, output: `▲ Vercel ENV ${key} upserté sur [${target.join(", ")}] (id ${json.id}).` };
  } catch (e) {
    return { ok: false, output: `vercel_env_set: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot11Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot11Tool(name)) return null;
  try {
    if (name === "hubspot_contact_create")
      return await runHubspot(rawArgs as unknown as HubspotArgs, supabase, userId);
    if (name === "calendly_event_types")
      return await runCalendly(rawArgs as unknown as CalendlyArgs, supabase, userId);
    if (name === "posthog_capture")
      return await runPosthog(rawArgs as unknown as PosthogArgs, supabase, userId);
    if (name === "slack_send_message")
      return await runSlack(rawArgs as unknown as SlackArgs, supabase, userId);
    if (name === "github_pr_create")
      return await runGithubPr(rawArgs as unknown as GithubPrArgs, supabase, userId);
    if (name === "vercel_env_set")
      return await runVercelEnv(rawArgs as unknown as VercelEnvArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
