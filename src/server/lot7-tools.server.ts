/**
 * LOT 7 — Stripe billing + Multi-agent + RAG vectoriel projet.
 *
 *  - rag_index             : indexe un texte dans la mémoire vectorielle du projet
 *                            (table project_docs). Embedding OpenAI text-embedding-3-small
 *                            (1536 dims) via clé user `openai_api_key`.
 *  - rag_search            : recherche sémantique top-k via la fonction SQL
 *                            `match_project_docs` (cosine similarity).
 *  - subagent_run          : lance un sous-agent focalisé (un seul appel LLM
 *                            non-streaming, prompt système strict) pour décomposer
 *                            ou synthétiser une tâche. Modèle par défaut gpt-4o-mini.
 *  - stripe_checkout_create: crée une Stripe Checkout Session (clé `stripe_secret_key`).
 *                            Retourne l'URL de paiement à coller dans le chat ou un email.
 *
 *  Worker-safe : fetch + JSON only. BYOK strict (aucune clé Lovable consommée).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT7_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "rag_index",
  "rag_search",
  "subagent_run",
  "stripe_checkout_create",
]);

export function isLot7Tool(name: string): boolean {
  return LOT7_TOOLS.has(name as ToolName);
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

// ---------- helper : OpenAI embedding ----------

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embedding ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Embedding manquant");
  return vec;
}

// ---------- rag_index ----------

interface RagIndexArgs {
  title?: string;
  content: string;
  tags?: string[];
}

async function runRagIndex(
  args: RagIndexArgs,
  supabase: SupabaseClient<Database>,
  projectId: string | null,
  userId: string,
): Promise<ToolResult> {
  if (!projectId) return { ok: false, output: "rag_index: aucun projet actif." };
  const content = String(args.content ?? "").trim();
  if (!content) return { ok: false, output: "rag_index: 'content' requis." };
  if (content.length > 30_000) return { ok: false, output: "rag_index: contenu > 30k chars." };

  const apiKey = await fetchUserKey(supabase, userId, "openai_api_key");
  if (!apiKey) return { ok: false, output: "rag_index: clé `openai_api_key` requise pour les embeddings." };

  // Récupère org_id du projet
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr || !proj) return { ok: false, output: `rag_index: projet introuvable (${projErr?.message ?? ""})` };

  let embedding: number[];
  try {
    embedding = await getEmbedding(content, apiKey);
  } catch (e) {
    return { ok: false, output: `rag_index: ${e instanceof Error ? e.message : "embedding error"}` };
  }
  markUsed(supabase, userId, "openai_api_key");

  const tags = Array.isArray(args.tags) ? args.tags.slice(0, 20).map(String) : [];
  const title = String(args.title ?? "Note").slice(0, 200);

  const { data: inserted, error: insErr } = await supabase
    .from("project_docs")
    .insert({
      project_id: projectId,
      org_id: proj.org_id,
      owner_id: userId,
      title,
      content,
      tags,
      // pgvector accepte un array JSON via supabase-js
      embedding: embedding as unknown as string,
      embedding_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr) return { ok: false, output: `rag_index: insert échoué — ${insErr.message}` };
  return {
    ok: true,
    output: `📚 Doc indexé (id ${inserted.id}) — "${title}" (${content.length} chars, ${tags.length} tags).`,
  };
}

// ---------- rag_search ----------

interface RagSearchArgs {
  query: string;
  limit?: number;
  min_similarity?: number;
}

async function runRagSearch(
  args: RagSearchArgs,
  supabase: SupabaseClient<Database>,
  projectId: string | null,
  userId: string,
): Promise<ToolResult> {
  if (!projectId) return { ok: false, output: "rag_search: aucun projet actif." };
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, output: "rag_search: 'query' requis." };

  const apiKey = await fetchUserKey(supabase, userId, "openai_api_key");
  if (!apiKey) return { ok: false, output: "rag_search: clé `openai_api_key` requise." };

  let embedding: number[];
  try {
    embedding = await getEmbedding(query, apiKey);
  } catch (e) {
    return { ok: false, output: `rag_search: ${e instanceof Error ? e.message : "embedding error"}` };
  }
  markUsed(supabase, userId, "openai_api_key");

  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
  const minSim = Math.min(Math.max(args.min_similarity ?? 0.5, 0), 1);

  const { data, error } = await supabase.rpc("match_project_docs", {
    _project_id: projectId,
    _query_embedding: embedding as unknown as string,
    _match_count: limit,
    _min_similarity: minSim,
  });

  if (error) return { ok: false, output: `rag_search: ${error.message}` };
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: true, output: "(aucun document pertinent trouvé)" };
  }
  const formatted = data
    .map(
      (d, i) =>
        `${i + 1}. [${(d.similarity ?? 0).toFixed(2)}] ${d.title ?? "Note"}\n${(d.content ?? "").slice(0, 400)}`,
    )
    .join("\n\n");
  return { ok: true, output: `🔎 ${data.length} doc(s) :\n\n${formatted}` };
}

// ---------- subagent_run ----------

interface SubagentArgs {
  goal: string;
  context?: string;
  model?: string;
  max_tokens?: number;
}

async function runSubagent(
  args: SubagentArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const goal = String(args.goal ?? "").trim();
  if (!goal) return { ok: false, output: "subagent_run: 'goal' requis." };

  const apiKey = await fetchUserKey(supabase, userId, "openai_api_key");
  if (!apiKey) {
    return {
      ok: false,
      output: "subagent_run: clé `openai_api_key` requise (le sous-agent tourne en BYOK).",
    };
  }

  const model = String(args.model ?? "gpt-4o-mini");
  const maxTokens = Math.min(Math.max(args.max_tokens ?? 800, 100), 4000);
  const context = String(args.context ?? "").slice(0, 12_000);

  const systemPrompt =
    "Tu es un sous-agent focalisé. Réponds de manière dense, structurée, sans préambule. " +
    "Pas de salutation, pas de réflexion à voix haute. Si on te demande un plan, retourne uniquement les étapes. " +
    "Si on te demande une analyse, retourne uniquement les conclusions.";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: context ? `Contexte:\n${context}\n\n---\n\nObjectif: ${goal}` : `Objectif: ${goal}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, output: `subagent_run: HTTP ${res.status} ${t.slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const reply = json.choices?.[0]?.message?.content ?? "";
    const tokens = json.usage?.total_tokens ?? 0;
    markUsed(supabase, userId, "openai_api_key");
    return {
      ok: true,
      output: `🤖 Sous-agent (${model}, ${tokens} tokens) :\n\n${reply}`,
    };
  } catch (e) {
    return { ok: false, output: `subagent_run: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- stripe_checkout_create ----------

interface StripeCheckoutArgs {
  price_id: string;
  mode?: "payment" | "subscription";
  success_url: string;
  cancel_url: string;
  customer_email?: string;
  quantity?: number;
}

async function runStripeCheckout(
  args: StripeCheckoutArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const priceId = String(args.price_id ?? "").trim();
  const successUrl = String(args.success_url ?? "").trim();
  const cancelUrl = String(args.cancel_url ?? "").trim();
  if (!priceId.startsWith("price_")) {
    return { ok: false, output: "stripe_checkout_create: 'price_id' invalide (doit commencer par 'price_')." };
  }
  if (!/^https?:\/\//i.test(successUrl) || !/^https?:\/\//i.test(cancelUrl)) {
    return { ok: false, output: "stripe_checkout_create: success_url et cancel_url doivent être des URLs http(s)." };
  }
  const mode = args.mode === "subscription" ? "subscription" : "payment";
  const quantity = Math.min(Math.max(args.quantity ?? 1, 1), 100);

  const apiKey = await fetchUserKey(supabase, userId, "stripe_secret_key");
  if (!apiKey) {
    return { ok: false, output: "stripe_checkout_create: clé `stripe_secret_key` manquante." };
  }

  // Stripe utilise application/x-www-form-urlencoded
  const form = new URLSearchParams();
  form.set("mode", mode);
  form.set("success_url", successUrl);
  form.set("cancel_url", cancelUrl);
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", String(quantity));
  if (args.customer_email) form.set("customer_email", String(args.customer_email));

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      return { ok: false, output: `stripe_checkout_create: ${json.error?.message ?? `HTTP ${res.status}`}` };
    }
    markUsed(supabase, userId, "stripe_secret_key");
    return {
      ok: true,
      output: `💳 Checkout Stripe créé (${json.id}). URL : ${json.url}`,
    };
  } catch (e) {
    return { ok: false, output: `stripe_checkout_create: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot7Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  projectId: string | null,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot7Tool(name)) return null;
  try {
    if (name === "rag_index")
      return await runRagIndex(rawArgs as unknown as RagIndexArgs, supabase, projectId, userId);
    if (name === "rag_search")
      return await runRagSearch(rawArgs as unknown as RagSearchArgs, supabase, projectId, userId);
    if (name === "subagent_run")
      return await runSubagent(rawArgs as unknown as SubagentArgs, supabase, userId);
    if (name === "stripe_checkout_create")
      return await runStripeCheckout(rawArgs as unknown as StripeCheckoutArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
