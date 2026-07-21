/**
 * LOT 12 — Marketing automation, messaging, no-code DBs, automation triggers.
 *
 *  - mailchimp_subscribe   : ajoute/maj un membre dans une audience Mailchimp (BYOK `mailchimp_api_key`, format `xxx-usZ`).
 *  - klaviyo_track         : envoie un event Klaviyo (BYOK `klaviyo_api_key`, server-side Public API key `pk_...`).
 *  - discord_webhook       : poste un message via webhook Discord (BYOK `discord_webhook_url`, URL complète).
 *  - notion_db_query       : query une base Notion (filter + sorts) (BYOK `notion_api_key`).
 *  - airtable_upsert       : crée ou met à jour des records Airtable (BYOK `airtable_api_key` + `airtable_base_id`).
 *  - zapier_trigger        : déclenche un Zap via webhook Zapier (BYOK `zapier_webhook_url`).
 *
 * Worker-safe : fetch + JSON, BYOK strict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT12_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "mailchimp_subscribe",
  "klaviyo_track",
  "discord_webhook",
  "notion_db_query",
  "airtable_upsert",
  "zapier_trigger",
]);

export function isLot12Tool(name: string): boolean {
  return LOT12_TOOLS.has(name as ToolName);
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

function md5Hex(input: string): Promise<string> {
  // Web Crypto n'expose pas md5. Mailchimp exige md5(lower(email)) pour subscriber-hash.
  // Implémentation pure JS (Joseph Myers, MIT).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function md5cycle(x: number[], k: number[]) {
    let [a, b, c, d] = x;
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function md51(s: string) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    for (i = 64; i <= s.length; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const sub = s.substring(i - 64);
    for (let j = 0; j < sub.length; j++) tail[j >> 2] |= sub.charCodeAt(j) << ((j % 4) << 3);
    tail[sub.length >> 2] |= 0x80 << ((sub.length % 4) << 3);
    if (sub.length > 55) {
      md5cycle(state, tail);
      for (let j = 0; j < 16; j++) tail[j] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function md5blk(s: string) {
    const md5blks: number[] = [];
    for (let i = 0; i < 64; i += 4)
      md5blks[i >> 2] =
        s.charCodeAt(i) +
        (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) +
        (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  const hex_chr = "0123456789abcdef".split("");
  function rhex(n: number) {
    let s = "";
    for (let j = 0; j < 4; j++)
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
    return s;
  }
  function hex(x: number[]) {
    return x.map(rhex).join("");
  }
  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }
  return Promise.resolve(hex(md51(input)));
}

// ---------- mailchimp_subscribe ----------

interface MailchimpArgs {
  list_id: string;
  email: string;
  status?: "subscribed" | "pending" | "unsubscribed" | "cleaned";
  merge_fields?: Record<string, string>;
  tags?: string[];
}

async function runMailchimp(
  args: MailchimpArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.list_id || !args.email) {
    return { ok: false, output: "mailchimp_subscribe: list_id et email requis." };
  }
  const key = await fetchUserKey(supabase, userId, "mailchimp_api_key");
  if (!key) {
    return {
      ok: false,
      output: "🔑 Clé Mailchimp manquante (`mailchimp_api_key`, format xxxx-usZ).",
    };
  }
  const dc = key.split("-")[1];
  if (!dc) return { ok: false, output: "mailchimp_api_key invalide (data center manquant)." };

  const hash = await md5Hex(args.email.toLowerCase().trim());
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${args.list_id}/members/${hash}`;
  const body: Record<string, unknown> = {
    email_address: args.email,
    status_if_new: args.status ?? "subscribed",
    status: args.status ?? "subscribed",
  };
  if (args.merge_fields) body.merge_fields = args.merge_fields;
  if (args.tags && args.tags.length > 0) body.tags = args.tags;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${btoa(`anystring:${key}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; detail?: string };
    if (!res.ok) {
      return { ok: false, output: `mailchimp_subscribe: ${res.status} ${json.detail ?? ""}` };
    }
    markUsed(supabase, userId, "mailchimp_api_key");
    return {
      ok: true,
      output: `✉️ Mailchimp upsert ${args.email} → liste ${args.list_id} (status ${body.status}).`,
    };
  } catch (e) {
    return { ok: false, output: `mailchimp_subscribe: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- klaviyo_track ----------

interface KlaviyoArgs {
  metric: string;
  email: string;
  properties?: Record<string, unknown>;
  value?: number;
}

async function runKlaviyo(
  args: KlaviyoArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.metric || !args.email) {
    return { ok: false, output: "klaviyo_track: metric et email requis." };
  }
  const key = await fetchUserKey(supabase, userId, "klaviyo_api_key");
  if (!key) return { ok: false, output: "🔑 `klaviyo_api_key` manquante (Private API key pk_...)." };

  const body = {
    data: {
      type: "event",
      attributes: {
        properties: args.properties ?? {},
        metric: { data: { type: "metric", attributes: { name: args.metric } } },
        profile: { data: { type: "profile", attributes: { email: args.email } } },
        value: args.value,
      },
    },
  };

  try {
    const res = await fetch("https://a.klaviyo.com/api/events/", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        "Content-Type": "application/json",
        revision: "2024-10-15",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, output: `klaviyo_track: ${res.status} ${txt.slice(0, 200)}` };
    }
    markUsed(supabase, userId, "klaviyo_api_key");
    return { ok: true, output: `📊 Klaviyo event "${args.metric}" envoyé pour ${args.email}.` };
  } catch (e) {
    return { ok: false, output: `klaviyo_track: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- discord_webhook ----------

interface DiscordArgs {
  content: string;
  username?: string;
  avatar_url?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embeds?: any[];
}

async function runDiscord(
  args: DiscordArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.content && !args.embeds) {
    return { ok: false, output: "discord_webhook: content ou embeds requis." };
  }
  const url = await fetchUserKey(supabase, userId, "discord_webhook_url");
  if (!url) {
    return { ok: false, output: "🔑 `discord_webhook_url` manquante (URL complète du webhook Discord)." };
  }
  if (!url.startsWith("https://discord.com/api/webhooks/") && !url.startsWith("https://discordapp.com/api/webhooks/")) {
    return { ok: false, output: "URL webhook Discord invalide." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: args.content,
        username: args.username,
        avatar_url: args.avatar_url,
        embeds: args.embeds,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => "");
      return { ok: false, output: `discord_webhook: ${res.status} ${txt.slice(0, 200)}` };
    }
    markUsed(supabase, userId, "discord_webhook_url");
    return { ok: true, output: `💬 Message Discord posté.` };
  } catch (e) {
    return { ok: false, output: `discord_webhook: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- notion_db_query ----------

interface NotionQueryArgs {
  database_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sorts?: any[];
  page_size?: number;
}

async function runNotionQuery(
  args: NotionQueryArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.database_id) return { ok: false, output: "notion_db_query: database_id requis." };
  const key = await fetchUserKey(supabase, userId, "notion_api_key");
  if (!key) return { ok: false, output: "🔑 `notion_api_key` manquante (secret_...)." };

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${args.database_id}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: args.filter,
        sorts: args.sorts,
        page_size: Math.min(args.page_size ?? 25, 100),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      results?: Array<{ id: string; properties?: Record<string, unknown> }>;
      message?: string;
    };
    if (!res.ok) {
      return { ok: false, output: `notion_db_query: ${res.status} ${json.message ?? ""}` };
    }
    markUsed(supabase, userId, "notion_api_key");
    const rows = (json.results ?? []).slice(0, 10).map((r) => `- ${r.id}`).join("\n");
    return {
      ok: true,
      output: `📚 Notion: ${json.results?.length ?? 0} pages trouvées${rows ? `\n${rows}` : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `notion_db_query: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- airtable_upsert ----------

interface AirtableArgs {
  table: string;
  records: Array<{ fields: Record<string, unknown>; id?: string }>;
  upsert_fields?: string[];
  base_id?: string;
}

async function runAirtable(
  args: AirtableArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.table || !args.records || args.records.length === 0) {
    return { ok: false, output: "airtable_upsert: table et records requis." };
  }
  const key = await fetchUserKey(supabase, userId, "airtable_api_key");
  if (!key) return { ok: false, output: "🔑 `airtable_api_key` manquante (PAT pat...)." };
  const baseId = args.base_id ?? (await fetchUserKey(supabase, userId, "airtable_base_id"));
  if (!baseId) return { ok: false, output: "🔑 `airtable_base_id` manquant (app...)." };

  const body: Record<string, unknown> = {
    records: args.records.slice(0, 10),
    typecast: true,
  };
  if (args.upsert_fields && args.upsert_fields.length > 0) {
    body.performUpsert = { fieldsToMergeOn: args.upsert_fields };
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(args.table)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      records?: Array<{ id: string }>;
      error?: { message?: string; type?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        output: `airtable_upsert: ${res.status} ${json.error?.message ?? json.error?.type ?? ""}`,
      };
    }
    markUsed(supabase, userId, "airtable_api_key");
    return {
      ok: true,
      output: `🗂️ Airtable: ${json.records?.length ?? 0} records upsertés dans "${args.table}".`,
    };
  } catch (e) {
    return { ok: false, output: `airtable_upsert: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- zapier_trigger ----------

interface ZapierArgs {
  payload: Record<string, unknown>;
  webhook_url?: string;
}

async function runZapier(
  args: ZapierArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = args.webhook_url ?? (await fetchUserKey(supabase, userId, "zapier_webhook_url"));
  if (!url) return { ok: false, output: "🔑 `zapier_webhook_url` manquante." };
  if (!url.startsWith("https://hooks.zapier.com/")) {
    return { ok: false, output: "URL Zapier invalide (doit commencer par https://hooks.zapier.com/)." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.payload ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, output: `zapier_trigger: ${res.status}` };
    }
    if (!args.webhook_url) markUsed(supabase, userId, "zapier_webhook_url");
    return { ok: true, output: `⚡ Zap déclenché.` };
  } catch (e) {
    return { ok: false, output: `zapier_trigger: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot12Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot12Tool(name)) return null;
  try {
    if (name === "mailchimp_subscribe")
      return await runMailchimp(rawArgs as unknown as MailchimpArgs, supabase, userId);
    if (name === "klaviyo_track")
      return await runKlaviyo(rawArgs as unknown as KlaviyoArgs, supabase, userId);
    if (name === "discord_webhook")
      return await runDiscord(rawArgs as unknown as DiscordArgs, supabase, userId);
    if (name === "notion_db_query")
      return await runNotionQuery(rawArgs as unknown as NotionQueryArgs, supabase, userId);
    if (name === "airtable_upsert")
      return await runAirtable(rawArgs as unknown as AirtableArgs, supabase, userId);
    if (name === "zapier_trigger")
      return await runZapier(rawArgs as unknown as ZapierArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
