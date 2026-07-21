/**
 * LOT 13 — Paiements alternatifs, banking, e-commerce, CMS headless, vector DB.
 *
 *  - lemonsqueezy_checkout : crée une session checkout Lemon Squeezy (BYOK `lemonsqueezy_api_key` + `lemonsqueezy_store_id`).
 *  - plaid_link_token      : crée un link_token Plaid pour onboarding banking (BYOK `plaid_client_id` + `plaid_secret`, env sandbox/prod).
 *  - shopify_product_create: crée un produit dans une boutique Shopify Admin (BYOK `shopify_admin_token` + `shopify_shop_domain`).
 *  - webflow_cms_create    : crée un item dans une collection Webflow CMS (BYOK `webflow_api_token`).
 *  - pinecone_upsert       : upsert de vecteurs dans un index Pinecone (BYOK `pinecone_api_key` + `pinecone_index_host`).
 *  - sanity_mutate         : applique des mutations (create/patch/delete) à un dataset Sanity (BYOK `sanity_api_token` + `sanity_project_id` + `sanity_dataset`).
 *
 * Worker-safe : fetch + JSON, BYOK strict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT13_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "lemonsqueezy_checkout",
  "plaid_link_token",
  "shopify_product_create",
  "webflow_cms_create",
  "pinecone_upsert",
  "sanity_mutate",
]);

export function isLot13Tool(name: string): boolean {
  return LOT13_TOOLS.has(name as ToolName);
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

// ---------- lemonsqueezy_checkout ----------

interface LemonsqueezyArgs {
  variant_id: string | number;
  store_id?: string | number;
  email?: string;
  name?: string;
  custom?: Record<string, string>;
  redirect_url?: string;
  receipt_link_url?: string;
}

async function runLemonsqueezy(
  args: LemonsqueezyArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.variant_id) return { ok: false, output: "lemonsqueezy_checkout: variant_id requis." };
  const key = await fetchUserKey(supabase, userId, "lemonsqueezy_api_key");
  if (!key) return { ok: false, output: "🔑 `lemonsqueezy_api_key` manquante." };
  const storeId = args.store_id ?? (await fetchUserKey(supabase, userId, "lemonsqueezy_store_id"));
  if (!storeId) return { ok: false, output: "🔑 `lemonsqueezy_store_id` manquant." };

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: args.email,
          name: args.name,
          custom: args.custom ?? {},
        },
        product_options: {
          redirect_url: args.redirect_url,
          receipt_link_url: args.receipt_link_url,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
        variant: { data: { type: "variants", id: String(args.variant_id) } },
      },
    },
  };

  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; attributes?: { url?: string } };
      errors?: Array<{ detail?: string }>;
    };
    if (!res.ok) {
      return {
        ok: false,
        output: `lemonsqueezy_checkout: ${res.status} ${json.errors?.[0]?.detail ?? ""}`,
      };
    }
    markUsed(supabase, userId, "lemonsqueezy_api_key");
    const url = json.data?.attributes?.url ?? "";
    return { ok: true, output: `🍋 Checkout Lemon Squeezy créé: ${url}` };
  } catch (e) {
    return { ok: false, output: `lemonsqueezy_checkout: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- plaid_link_token ----------

interface PlaidArgs {
  client_user_id: string;
  client_name?: string;
  products?: string[];
  country_codes?: string[];
  language?: string;
  env?: "sandbox" | "development" | "production";
}

async function runPlaid(
  args: PlaidArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.client_user_id) {
    return { ok: false, output: "plaid_link_token: client_user_id requis." };
  }
  const clientId = await fetchUserKey(supabase, userId, "plaid_client_id");
  const secret = await fetchUserKey(supabase, userId, "plaid_secret");
  if (!clientId || !secret) {
    return { ok: false, output: "🔑 `plaid_client_id` et `plaid_secret` requis." };
  }
  const env = args.env ?? "sandbox";
  const host =
    env === "production"
      ? "https://production.plaid.com"
      : env === "development"
      ? "https://development.plaid.com"
      : "https://sandbox.plaid.com";

  const body = {
    client_id: clientId,
    secret,
    client_name: args.client_name ?? "Nexyra App",
    user: { client_user_id: args.client_user_id },
    products: args.products ?? ["auth", "transactions"],
    country_codes: args.country_codes ?? ["US"],
    language: args.language ?? "en",
  };

  try {
    const res = await fetch(`${host}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      link_token?: string;
      expiration?: string;
      error_message?: string;
    };
    if (!res.ok || !json.link_token) {
      return { ok: false, output: `plaid_link_token: ${res.status} ${json.error_message ?? ""}` };
    }
    markUsed(supabase, userId, "plaid_secret");
    return {
      ok: true,
      output: `🏦 Plaid link_token (${env}) créé, expire ${json.expiration}: ${json.link_token.slice(0, 24)}…`,
    };
  } catch (e) {
    return { ok: false, output: `plaid_link_token: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- shopify_product_create ----------

interface ShopifyArgs {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string | string[];
  status?: "active" | "draft" | "archived";
  variants?: Array<{ price?: string; sku?: string; option1?: string }>;
  images?: Array<{ src: string }>;
  shop_domain?: string;
}

async function runShopify(
  args: ShopifyArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.title) return { ok: false, output: "shopify_product_create: title requis." };
  const token = await fetchUserKey(supabase, userId, "shopify_admin_token");
  if (!token) return { ok: false, output: "🔑 `shopify_admin_token` manquant (shpat_...)." };
  const domain = args.shop_domain ?? (await fetchUserKey(supabase, userId, "shopify_shop_domain"));
  if (!domain) return { ok: false, output: "🔑 `shopify_shop_domain` manquant (mystore.myshopify.com)." };

  const body = {
    product: {
      title: args.title,
      body_html: args.body_html,
      vendor: args.vendor,
      product_type: args.product_type,
      tags: Array.isArray(args.tags) ? args.tags.join(", ") : args.tags,
      status: args.status ?? "draft",
      variants: args.variants,
      images: args.images,
    },
  };

  try {
    const res = await fetch(`https://${domain}/admin/api/2024-10/products.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      product?: { id?: number; handle?: string };
      errors?: unknown;
    };
    if (!res.ok || !json.product) {
      return {
        ok: false,
        output: `shopify_product_create: ${res.status} ${JSON.stringify(json.errors ?? {}).slice(0, 200)}`,
      };
    }
    markUsed(supabase, userId, "shopify_admin_token");
    return {
      ok: true,
      output: `🛍️ Produit Shopify "${args.title}" créé (id ${json.product.id}, handle ${json.product.handle}).`,
    };
  } catch (e) {
    return { ok: false, output: `shopify_product_create: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- webflow_cms_create ----------

interface WebflowArgs {
  collection_id: string;
  field_data: Record<string, unknown>;
  is_draft?: boolean;
  is_archived?: boolean;
  publish?: boolean;
}

async function runWebflow(
  args: WebflowArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.collection_id || !args.field_data) {
    return { ok: false, output: "webflow_cms_create: collection_id + field_data requis." };
  }
  const token = await fetchUserKey(supabase, userId, "webflow_api_token");
  if (!token) return { ok: false, output: "🔑 `webflow_api_token` manquant." };

  const url = args.publish
    ? `https://api.webflow.com/v2/collections/${args.collection_id}/items/live`
    : `https://api.webflow.com/v2/collections/${args.collection_id}/items`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        isArchived: args.is_archived ?? false,
        isDraft: args.is_draft ?? false,
        fieldData: args.field_data,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok || !json.id) {
      return { ok: false, output: `webflow_cms_create: ${res.status} ${json.message ?? ""}` };
    }
    markUsed(supabase, userId, "webflow_api_token");
    return { ok: true, output: `🌊 Item Webflow créé (id ${json.id}${args.publish ? ", publié" : ""}).` };
  } catch (e) {
    return { ok: false, output: `webflow_cms_create: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- pinecone_upsert ----------

interface PineconeArgs {
  vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>;
  namespace?: string;
  index_host?: string;
}

async function runPinecone(
  args: PineconeArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.vectors || args.vectors.length === 0) {
    return { ok: false, output: "pinecone_upsert: vectors requis." };
  }
  const key = await fetchUserKey(supabase, userId, "pinecone_api_key");
  if (!key) return { ok: false, output: "🔑 `pinecone_api_key` manquante." };
  const host = args.index_host ?? (await fetchUserKey(supabase, userId, "pinecone_index_host"));
  if (!host) {
    return { ok: false, output: "🔑 `pinecone_index_host` manquant (ex: my-idx-xxxx.svc.region.pinecone.io)." };
  }
  const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  try {
    const res = await fetch(`https://${cleanHost}/vectors/upsert`, {
      method: "POST",
      headers: {
        "Api-Key": key,
        "Content-Type": "application/json",
        "X-Pinecone-API-Version": "2024-10",
      },
      body: JSON.stringify({
        vectors: args.vectors.slice(0, 100),
        namespace: args.namespace ?? "",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      upsertedCount?: number;
      message?: string;
    };
    if (!res.ok) {
      return { ok: false, output: `pinecone_upsert: ${res.status} ${json.message ?? ""}` };
    }
    markUsed(supabase, userId, "pinecone_api_key");
    return {
      ok: true,
      output: `🌲 Pinecone: ${json.upsertedCount ?? args.vectors.length} vecteurs upsertés${args.namespace ? ` (ns "${args.namespace}")` : ""}.`,
    };
  } catch (e) {
    return { ok: false, output: `pinecone_upsert: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- sanity_mutate ----------

interface SanityArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutations: any[];
  project_id?: string;
  dataset?: string;
  return_documents?: boolean;
}

async function runSanity(
  args: SanityArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.mutations || args.mutations.length === 0) {
    return { ok: false, output: "sanity_mutate: mutations requis." };
  }
  const token = await fetchUserKey(supabase, userId, "sanity_api_token");
  if (!token) return { ok: false, output: "🔑 `sanity_api_token` manquant (Editor+ token)." };
  const projectId = args.project_id ?? (await fetchUserKey(supabase, userId, "sanity_project_id"));
  const dataset = args.dataset ?? (await fetchUserKey(supabase, userId, "sanity_dataset")) ?? "production";
  if (!projectId) return { ok: false, output: "🔑 `sanity_project_id` manquant." };

  try {
    const res = await fetch(
      `https://${projectId}.api.sanity.io/v2024-10-01/data/mutate/${dataset}${args.return_documents ? "?returnDocuments=true" : ""}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mutations: args.mutations.slice(0, 50) }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      transactionId?: string;
      results?: Array<{ id?: string; operation?: string }>;
      error?: { description?: string };
    };
    if (!res.ok) {
      return { ok: false, output: `sanity_mutate: ${res.status} ${json.error?.description ?? ""}` };
    }
    markUsed(supabase, userId, "sanity_api_token");
    return {
      ok: true,
      output: `📝 Sanity: ${json.results?.length ?? args.mutations.length} mutations appliquées (tx ${json.transactionId ?? "?"}).`,
    };
  } catch (e) {
    return { ok: false, output: `sanity_mutate: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot13Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot13Tool(name)) return null;
  try {
    if (name === "lemonsqueezy_checkout")
      return await runLemonsqueezy(rawArgs as unknown as LemonsqueezyArgs, supabase, userId);
    if (name === "plaid_link_token")
      return await runPlaid(rawArgs as unknown as PlaidArgs, supabase, userId);
    if (name === "shopify_product_create")
      return await runShopify(rawArgs as unknown as ShopifyArgs, supabase, userId);
    if (name === "webflow_cms_create")
      return await runWebflow(rawArgs as unknown as WebflowArgs, supabase, userId);
    if (name === "pinecone_upsert")
      return await runPinecone(rawArgs as unknown as PineconeArgs, supabase, userId);
    if (name === "sanity_mutate")
      return await runSanity(rawArgs as unknown as SanityArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
