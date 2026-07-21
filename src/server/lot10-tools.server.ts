/**
 * LOT 10 — Sync productivité, messaging, email, search, storage.
 *
 *  - notion_create_page   : crée une page Notion (BYOK `notion_api_key`).
 *  - linear_create_issue  : crée une issue Linear via GraphQL (BYOK `linear_api_key`).
 *  - twilio_send_sms      : envoie un SMS/WhatsApp Twilio (BYOK `twilio_account_sid` + `twilio_auth_token`).
 *  - resend_email         : envoie un email transactionnel via Resend (BYOK `resend_api_key`).
 *  - algolia_index        : indexe un objet dans un index Algolia (BYOK `algolia_app_id` + `algolia_admin_key`).
 *  - r2_upload            : upload texte vers Cloudflare R2 via presigned PUT (BYOK `r2_endpoint` + `r2_access_key_id` + `r2_secret_access_key`).
 *
 * Worker-safe : fetch + JSON, BYOK strict (zéro consommation budget Lovable).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT10_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "notion_create_page",
  "linear_create_issue",
  "twilio_send_sms",
  "resend_email",
  "algolia_index",
  "r2_upload",
]);

export function isLot10Tool(name: string): boolean {
  return LOT10_TOOLS.has(name as ToolName);
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

// ---------- notion_create_page ----------

interface NotionArgs {
  parent_page_id?: string;
  parent_database_id?: string;
  title: string;
  content?: string;
}

async function runNotion(
  args: NotionArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const title = String(args.title ?? "").trim();
  if (!title) return { ok: false, output: "notion_create_page: 'title' requis." };
  if (!args.parent_page_id && !args.parent_database_id) {
    return { ok: false, output: "notion_create_page: parent_page_id OU parent_database_id requis." };
  }
  const key = await fetchUserKey(supabase, userId, "notion_api_key");
  if (!key) return { ok: false, output: "notion_create_page: clé `notion_api_key` manquante." };

  const parent = args.parent_database_id
    ? { database_id: args.parent_database_id }
    : { page_id: args.parent_page_id };

  const properties = args.parent_database_id
    ? { Name: { title: [{ text: { content: title.slice(0, 200) } }] } }
    : { title: [{ text: { content: title.slice(0, 200) } }] };

  const body: Record<string, unknown> = { parent, properties };
  if (args.content) {
    body.children = [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: String(args.content).slice(0, 2000) } }],
        },
      },
    ];
  }

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; message?: string };
    if (!res.ok) return { ok: false, output: `notion_create_page: ${res.status} ${json.message ?? ""}` };
    markUsed(supabase, userId, "notion_api_key");
    return { ok: true, output: `📝 Page Notion créée : ${json.url ?? json.id}` };
  } catch (e) {
    return { ok: false, output: `notion_create_page: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- linear_create_issue ----------

interface LinearArgs {
  team_id: string;
  title: string;
  description?: string;
  priority?: 0 | 1 | 2 | 3 | 4;
}

async function runLinear(
  args: LinearArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const title = String(args.title ?? "").trim();
  const teamId = String(args.team_id ?? "").trim();
  if (!title || !teamId) return { ok: false, output: "linear_create_issue: 'title' et 'team_id' requis." };
  const key = await fetchUserKey(supabase, userId, "linear_api_key");
  if (!key) return { ok: false, output: "linear_create_issue: clé `linear_api_key` manquante." };

  const query = `mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) { success issue { id identifier url title } }
  }`;
  const input: Record<string, unknown> = { teamId, title };
  if (args.description) input.description = String(args.description).slice(0, 5000);
  if (typeof args.priority === "number") input.priority = args.priority;

  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { input } }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { issueCreate?: { success?: boolean; issue?: { identifier?: string; url?: string } } };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) {
      return { ok: false, output: `linear_create_issue: ${json.errors.map((e) => e.message).join("; ")}` };
    }
    const issue = json.data?.issueCreate?.issue;
    if (!issue) return { ok: false, output: `linear_create_issue: échec (HTTP ${res.status}).` };
    markUsed(supabase, userId, "linear_api_key");
    return { ok: true, output: `📌 Issue Linear ${issue.identifier} créée : ${issue.url}` };
  } catch (e) {
    return { ok: false, output: `linear_create_issue: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- twilio_send_sms ----------

interface TwilioArgs {
  to: string;
  from: string;
  body: string;
  whatsapp?: boolean;
}

async function runTwilio(
  args: TwilioArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const to = String(args.to ?? "").trim();
  const from = String(args.from ?? "").trim();
  const body = String(args.body ?? "").trim();
  if (!to || !from || !body) return { ok: false, output: "twilio_send_sms: to, from, body requis." };

  const sid = await fetchUserKey(supabase, userId, "twilio_account_sid");
  const token = await fetchUserKey(supabase, userId, "twilio_auth_token");
  if (!sid || !token) {
    return { ok: false, output: "twilio_send_sms: clés `twilio_account_sid` + `twilio_auth_token` requises." };
  }

  const prefix = args.whatsapp ? "whatsapp:" : "";
  const form = new URLSearchParams();
  form.set("To", `${prefix}${to}`);
  form.set("From", `${prefix}${from}`);
  form.set("Body", body.slice(0, 1500));

  try {
    const auth = btoa(`${sid}:${token}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; status?: string };
    if (!res.ok) return { ok: false, output: `twilio_send_sms: ${res.status} ${json.message ?? ""}` };
    markUsed(supabase, userId, "twilio_account_sid");
    markUsed(supabase, userId, "twilio_auth_token");
    return { ok: true, output: `📱 ${args.whatsapp ? "WhatsApp" : "SMS"} envoyé (sid ${json.sid}, statut ${json.status}).` };
  } catch (e) {
    return { ok: false, output: `twilio_send_sms: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- resend_email ----------

interface ResendArgs {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
}

async function runResend(
  args: ResendArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const subject = String(args.subject ?? "").trim();
  const from = String(args.from ?? "").trim();
  const to = Array.isArray(args.to) ? args.to : [args.to];
  if (!subject || !from || !to.length) {
    return { ok: false, output: "resend_email: from, to, subject requis." };
  }
  if (!args.html && !args.text) return { ok: false, output: "resend_email: html OU text requis." };

  const key = await fetchUserKey(supabase, userId, "resend_api_key");
  if (!key) return { ok: false, output: "resend_email: clé `resend_api_key` manquante." };

  const body: Record<string, unknown> = { from, to, subject };
  if (args.html) body.html = String(args.html);
  if (args.text) body.text = String(args.text);
  if (args.reply_to) body.reply_to = String(args.reply_to);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, output: `resend_email: ${res.status} ${json.message ?? json.name ?? ""}` };
    markUsed(supabase, userId, "resend_api_key");
    return { ok: true, output: `✉️ Email envoyé (id ${json.id}) à ${to.join(", ")}.` };
  } catch (e) {
    return { ok: false, output: `resend_email: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- algolia_index ----------

interface AlgoliaArgs {
  index_name: string;
  object: Record<string, unknown>;
  object_id?: string;
}

async function runAlgolia(
  args: AlgoliaArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const indexName = String(args.index_name ?? "").trim();
  if (!indexName || !args.object || typeof args.object !== "object") {
    return { ok: false, output: "algolia_index: index_name + object requis." };
  }
  const appId = await fetchUserKey(supabase, userId, "algolia_app_id");
  const adminKey = await fetchUserKey(supabase, userId, "algolia_admin_key");
  if (!appId || !adminKey) {
    return { ok: false, output: "algolia_index: clés `algolia_app_id` + `algolia_admin_key` requises." };
  }
  const obj = { ...args.object };
  if (args.object_id) (obj as Record<string, unknown>).objectID = args.object_id;

  try {
    const url = `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}${
      args.object_id ? `/${encodeURIComponent(args.object_id)}` : ""
    }`;
    const res = await fetch(url, {
      method: args.object_id ? "PUT" : "POST",
      headers: {
        "X-Algolia-API-Key": adminKey,
        "X-Algolia-Application-Id": appId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(obj),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      objectID?: string;
      taskID?: number;
      message?: string;
    };
    if (!res.ok) return { ok: false, output: `algolia_index: ${res.status} ${json.message ?? ""}` };
    markUsed(supabase, userId, "algolia_app_id");
    markUsed(supabase, userId, "algolia_admin_key");
    return {
      ok: true,
      output: `🔍 Algolia indexé dans '${indexName}' (objectID ${json.objectID}, task ${json.taskID}).`,
    };
  } catch (e) {
    return { ok: false, output: `algolia_index: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- r2_upload (Cloudflare R2 via S3 SigV4) ----------

interface R2Args {
  bucket: string;
  key: string;
  content: string;
  content_type?: string;
}

// Minimal AWS SigV4 for PUT to R2. Worker-safe (Web Crypto).
async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuf =
    key instanceof Uint8Array ? key.slice().buffer : key;
  const k = await crypto.subtle.importKey(
    "raw",
    keyBuf as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

async function runR2(
  args: R2Args,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const bucket = String(args.bucket ?? "").trim();
  const key = String(args.key ?? "").trim();
  const content = String(args.content ?? "");
  if (!bucket || !key || !content) return { ok: false, output: "r2_upload: bucket, key, content requis." };

  const endpoint = await fetchUserKey(supabase, userId, "r2_endpoint"); // ex https://<acct>.r2.cloudflarestorage.com
  const accessKey = await fetchUserKey(supabase, userId, "r2_access_key_id");
  const secretKey = await fetchUserKey(supabase, userId, "r2_secret_access_key");
  if (!endpoint || !accessKey || !secretKey) {
    return { ok: false, output: "r2_upload: clés `r2_endpoint`, `r2_access_key_id`, `r2_secret_access_key` requises." };
  }

  try {
    const url = new URL(`/${bucket}/${key.replace(/^\/+/, "")}`, endpoint);
    const host = url.host;
    const contentType = args.content_type || "text/plain; charset=utf-8";
    const payloadHash = await sha256Hex(content);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const region = "auto";
    const service = "s3";

    const canonicalHeaders =
      `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `PUT\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(
      canonicalRequest,
    )}`;

    const kDate = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, "aws4_request");
    const sigBuf = await hmac(kSigning, stringToSign);
    const signature = [...new Uint8Array(sigBuf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      body: content,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `r2_upload: ${res.status} ${t.slice(0, 300)}` };
    }
    markUsed(supabase, userId, "r2_endpoint");
    markUsed(supabase, userId, "r2_access_key_id");
    markUsed(supabase, userId, "r2_secret_access_key");
    return { ok: true, output: `☁️ Uploadé sur R2 : ${bucket}/${key} (${content.length} bytes).` };
  } catch (e) {
    return { ok: false, output: `r2_upload: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot10Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot10Tool(name)) return null;
  try {
    if (name === "notion_create_page")
      return await runNotion(rawArgs as unknown as NotionArgs, supabase, userId);
    if (name === "linear_create_issue")
      return await runLinear(rawArgs as unknown as LinearArgs, supabase, userId);
    if (name === "twilio_send_sms")
      return await runTwilio(rawArgs as unknown as TwilioArgs, supabase, userId);
    if (name === "resend_email")
      return await runResend(rawArgs as unknown as ResendArgs, supabase, userId);
    if (name === "algolia_index")
      return await runAlgolia(rawArgs as unknown as AlgoliaArgs, supabase, userId);
    if (name === "r2_upload") return await runR2(rawArgs as unknown as R2Args, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
