/**
 * Elena V3 — Axe A : cache LLM hash-based + routage intelligent.
 * Axe F : routing multi-provider (DeepSeek éligible si user a une clé).
 * Axe G : redaction PII avant envoi au provider tiers.
 *
 * BYOK strict : on appelle l'API du provider directement avec la clé de
 * l'utilisateur (jamais Lovable AI Gateway — voir mem://product/agent-providers).
 */
import { createHash } from "node:crypto";
import { generateText, embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { pickModelForTask, type TaskType } from "./elena-subagents.server";
import { recordMetric } from "./elena-metrics.server";
import { redactPII } from "./pii-redaction.server";
import { resolveProvider, createProviderModel, getUserDeepSeekKey } from "./llm-provider.server";
import { resolveUserLLM } from "./user-llm-resolver.server";

const SEMANTIC_THRESHOLD = 0.95;
const EMBEDDING_MODEL = "text-embedding-3-small";
// Min length pour tenter le sémantique (évite l'overhead sur prompts triviaux)
const SEMANTIC_MIN_LEN = 60;

// 🚫 Pas de Gemini (préférence user) — fallback léger sur OpenAI nano.
const TRIVIAL_MODEL = "openai/gpt-5-nano";
const TRIVIAL_BRIEF_THRESHOLD = 220; // caractères

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function hashKey(model: string, system: string, prompt: string) {
  return createHash("sha256").update(`${model}\n---\n${system}\n---\n${prompt}`).digest("hex");
}

export function routeModel(task: TaskType, brief: string): string {
  if (task === "trivial_edit") return TRIVIAL_MODEL;
  if (brief.length < TRIVIAL_BRIEF_THRESHOLD && (task === "developer" || task === "architect")) {
    return TRIVIAL_MODEL;
  }
  return pickModelForTask(task);
}

export type CachedGenerateResult = {
  text: string;
  model: string;
  cacheHit: boolean;
  cacheType?: "exact" | "semantic" | "miss";
  similarity?: number;
  tokensInput: number;
  tokensOutput: number;
  piiFindings?: import("./pii-redaction.server").PIIFinding[];
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Elena arrêtée par l'utilisateur", "AbortError");
}

function stripPrefix(model: string) {
  return model.replace(/^openai\//, "");
}

async function tryEmbed(openai: ReturnType<typeof createOpenAI>, text: string): Promise<number[] | null> {
  try {
    const { embedding } = await embed({ model: openai.embedding(EMBEDDING_MODEL), value: text });
    return embedding;
  } catch {
    return null;
  }
}

export async function cachedGenerate(
  systemPrompt: string,
  userBrief: string,
  task: TaskType,
  openaiKey: string | null,
  opts?: { userId?: string; deepseekKey?: string | null; abortSignal?: AbortSignal },
): Promise<CachedGenerateResult> {
  const callStart = Date.now();
  assertNotAborted(opts?.abortSignal);

  // Axe G — PII redaction AVANT toute requête réseau (hash, embed, LLM)
  const piiSystem = redactPII(systemPrompt);
  const piiBrief = redactPII(userBrief);
  const safeSystem = piiSystem.redacted;
  const safeBrief = piiBrief.redacted;
  const piiFindings = [...piiSystem.findings, ...piiBrief.findings];

  // Axe F — résolution provider
  // 1) Priorité au Cerveau d'Elena (Réglages → Cerveau d'Elena) si user authentifié.
  // 2) Sinon heuristique DeepSeek vs OpenAI legacy.
  let resolved: { provider: string; client?: unknown; modelName: string; languageModel?: import("ai").LanguageModel };
  if (opts?.userId) {
    const cerveau = await resolveUserLLM(opts.userId, task);
    if (cerveau.ok) {
      resolved = {
        provider: cerveau.resolved.provider,
        modelName: cerveau.resolved.model,
        languageModel: cerveau.resolved.languageModel,
      };
    } else {
      let deepseekKey = opts?.deepseekKey ?? null;
      if (!deepseekKey) deepseekKey = await getUserDeepSeekKey(opts.userId);
      const preferredOpenAIModel = routeModel(task, safeBrief);
      const r = resolveProvider({ task, briefLen: safeBrief.length, openaiKey: openaiKey ?? "", deepseekKey, preferredOpenAIModel });
      resolved = { provider: r.provider, client: r.client, modelName: r.modelName };
    }
  } else {
    const preferredOpenAIModel = routeModel(task, safeBrief);
    const r = resolveProvider({ task, briefLen: safeBrief.length, openaiKey: openaiKey ?? "", deepseekKey: opts?.deepseekKey ?? null, preferredOpenAIModel });
    resolved = { provider: r.provider, client: r.client, modelName: r.modelName };
  }
  // Le cache key inclut le provider+model pour éviter de mélanger les réponses
  const fullModelId = `${resolved.provider}/${resolved.modelName}`;
  const cacheKey = hashKey(fullModelId, safeSystem, safeBrief);
  const supa = adminClient();

  // 1) lookup exact
  const { data: hit } = await supa
    .from("llm_cache")
    .select("response_text, tokens_input, tokens_output, hits")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (hit) {
    await supa
      .from("llm_cache")
      .update({ hits: (hit.hits ?? 1) + 1, last_used_at: new Date().toISOString() })
      .eq("cache_key", cacheKey);
    void recordMetric({
      userId: opts?.userId ?? null,
      endpoint: `sub-${task}`,
      taskType: task,
      model: fullModelId,
      cacheType: "exact",
      tokensInput: hit.tokens_input ?? 0,
      tokensOutput: hit.tokens_output ?? 0,
      latencyMs: Date.now() - callStart,
      success: true,
    });
    return {
      text: hit.response_text,
      model: fullModelId,
      cacheHit: true,
      cacheType: "exact",
      tokensInput: hit.tokens_input ?? 0,
      tokensOutput: hit.tokens_output ?? 0,
      piiFindings,
    };
  }

  // L'embedding sémantique utilise OpenAI quand la clé existe. Si le Cerveau
  // route vers OpenRouter/DeepSeek sans clé OpenAI, on saute juste ce cache :
  // l'appel principal doit quand même respecter le Cerveau.
  const openaiForEmbed = openaiKey ? createOpenAI({ apiKey: openaiKey }) : null;

  // 2) lookup sémantique
  let queryEmbedding: number[] | null = null;
  if (openaiForEmbed && safeBrief.length >= SEMANTIC_MIN_LEN) {
    queryEmbedding = await tryEmbed(openaiForEmbed, `${safeSystem}\n---\n${safeBrief}`);
    if (queryEmbedding) {
      const { data: matches } = await supa.rpc("match_llm_cache", {
        query_embedding: queryEmbedding as unknown as string,
        match_model: fullModelId,
        match_threshold: SEMANTIC_THRESHOLD,
        match_count: 1,
      });
      const match = matches?.[0];
      if (match) {
        await supa
          .from("llm_cache")
          .update({
            semantic_hits: (match.semantic_hits ?? 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", match.id);
        void recordMetric({
          userId: opts?.userId ?? null,
          endpoint: `sub-${task}`,
          taskType: task,
          model: fullModelId,
          cacheType: "semantic",
          tokensInput: match.tokens_input ?? 0,
          tokensOutput: match.tokens_output ?? 0,
          latencyMs: Date.now() - callStart,
          success: true,
        });
        return {
          text: match.response_text,
          model: fullModelId,
          cacheHit: true,
          cacheType: "semantic",
          similarity: match.similarity,
          tokensInput: match.tokens_input ?? 0,
          tokensOutput: match.tokens_output ?? 0,
          piiFindings,
        };
      }
    }
  }

  // 3) miss complet → appel provider résolu (Cerveau | OpenAI | DeepSeek)
  try {
    assertNotAborted(opts?.abortSignal);
    if (!resolved.languageModel && !openaiKey && resolved.provider === "openai") {
      throw new Error("Clé OpenAI manquante pour ce modèle");
    }
    const modelToUse = resolved.languageModel
      ?? createProviderModel(
        resolved.provider as import("./llm-provider.server").ProviderName,
        resolved.client as Parameters<typeof createProviderModel>[1],
        resolved.modelName,
      );
    const result = await generateText({
      model: modelToUse,
      system: safeSystem,
      prompt: safeBrief,
      abortSignal: opts?.abortSignal,
    });
    const text = result.text ?? "";
    const tokensInput = result.usage?.inputTokens ?? 0;
    const tokensOutput = result.usage?.outputTokens ?? 0;

    // 4) store avec embedding (best effort)
    await supa.from("llm_cache").insert({
      cache_key: cacheKey,
      task_type: task,
      model: fullModelId,
      response_text: text,
      prompt_text: safeBrief.slice(0, 8000),
      embedding: queryEmbedding ? (queryEmbedding as unknown as string) : null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
    });

    void recordMetric({
      userId: opts?.userId ?? null,
      endpoint: `sub-${task}`,
      taskType: task,
      model: fullModelId,
      cacheType: "miss",
      tokensInput,
      tokensOutput,
      latencyMs: Date.now() - callStart,
      success: true,
    });

    return { text, model: fullModelId, cacheHit: false, cacheType: "miss", tokensInput, tokensOutput, piiFindings };
  } catch (e) {
    void recordMetric({
      userId: opts?.userId ?? null,
      endpoint: `sub-${task}`,
      taskType: task,
      model: fullModelId,
      cacheType: "miss",
      latencyMs: Date.now() - callStart,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

