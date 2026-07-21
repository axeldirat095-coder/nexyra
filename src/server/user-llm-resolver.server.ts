/**
 * Résolveur LLM centralisé — respecte le "Cerveau d'Elena".
 *
 * Lit la ligne `elena_ai_routing` de l'utilisateur, récupère la clé API
 * correspondante au provider sélectionné, et construit un `LanguageModel`
 * AI-SDK prêt à l'emploi.
 *
 * Utilisé par :
 *  - les outils vision (reverse_engineer_reference, qa_reference_code, qa_reference_render)
 *  - les sous-agents (designer / architect / developer / trivial) via llm-cache.server
 *
 * Fallback : si aucune config valide / clé manquante → l'appelant choisit son
 * propre fallback (Anthropic direct, OpenAI BYOK, etc.).
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { createClient } from "@supabase/supabase-js";
import { getUserRouting } from "./user-ai-routing.server";
import { createOpenRouterCacheFetch } from "./openrouter-cache-fetch.server";

export type SupportedProvider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "deepseek";

export type ResolverTask =
  | "orchestrator"
  | "chat"
  | "architect"
  | "reasoning"
  | "designer"
  | "developer"
  | "code"
  | "qa_visual"
  | "vision"
  | "trivial_edit"
  | "trivial";

const TASK_TO_COLUMNS: Record<ResolverTask, { provider: string; model: string }> = {
  orchestrator: { provider: "chat_provider", model: "chat_model" },
  chat: { provider: "chat_provider", model: "chat_model" },
  architect: { provider: "reasoning_provider", model: "reasoning_model" },
  reasoning: { provider: "reasoning_provider", model: "reasoning_model" },
  designer: { provider: "code_provider", model: "code_model" },
  developer: { provider: "code_provider", model: "code_model" },
  code: { provider: "code_provider", model: "code_model" },
  qa_visual: { provider: "vision_provider", model: "vision_model" },
  vision: { provider: "vision_provider", model: "vision_model" },
  trivial_edit: { provider: "trivial_provider", model: "trivial_model" },
  trivial: { provider: "trivial_provider", model: "trivial_model" },
};

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Récupère la clé API d'un user pour un provider donné (NULL si absente). */
export async function getUserKey(
  userId: string,
  provider: SupportedProvider,
): Promise<string | null> {
  try {
    const sb = adminClient();
    const { data } = await sb.rpc("get_api_key_decrypted" as never, {
      _owner_id: userId,
      _provider: provider,
    } as never);
    if (typeof data === "string" && data.trim()) return data;
    for (const svc of [provider, `${provider}_api_key`]) {
      const { data: ext } = await sb.rpc("get_external_key_decrypted" as never, {
        _owner_id: userId,
        _service: svc,
      } as never);
      if (typeof ext === "string" && ext.trim()) return ext;
    }
  } catch {
    /* swallow */
  }
  return null;
}

function buildLanguageModel(
  provider: SupportedProvider,
  apiKey: string,
  modelName: string,
): LanguageModel {
  if (provider === "openai") {
    const c = createOpenAI({ apiKey });
    const m = modelName.replace(/^openai\//, "");
    return c.chat(m as Parameters<typeof c.chat>[0]);
  }
  if (provider === "anthropic") {
    const c = createAnthropic({ apiKey });
    return c(modelName.replace(/^anthropic\//, ""));
  }
  if (provider === "deepseek") {
    const c = createOpenAICompatible({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
      name: "deepseek",
    });
    return c.chatModel(modelName);
  }
  // openrouter
  const c = createOpenAICompatible({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    name: "openrouter",
    headers: {
      "HTTP-Referer": "https://nexyra.app",
      "X-Title": "Nexyra Elena",
    },
    // Chantier 5 — cache Anthropic via wrapper fetch (no-op si non-Claude).
    fetch: createOpenRouterCacheFetch(),
  });
  return c.chatModel(modelName);
}

export type ResolvedUserLLM = {
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  languageModel: LanguageModel;
  /** Identifiant lisible pour les logs et l'UI : `provider/model`. */
  fullId: string;
};

export type ResolveResult =
  | { ok: true; resolved: ResolvedUserLLM }
  | { ok: false; reason: string; missingProvider?: SupportedProvider; providerUnsupported?: string };

/**
 * Résout le LLM pour une tâche en respectant le Cerveau d'Elena.
 * - Si tout est OK → retourne le LanguageModel prêt à l'emploi.
 * - Si la config est partielle / le provider non supporté / la clé manque
 *   → retourne `{ ok: false }` avec une raison claire pour l'utilisateur.
 */
export async function resolveUserLLM(
  userId: string,
  task: ResolverTask,
): Promise<ResolveResult> {
  const cols = TASK_TO_COLUMNS[task];
  if (!cols) return { ok: false, reason: `Tâche inconnue: ${task}` };

  const row = await getUserRouting(userId);
  if (!row) {
    return { ok: false, reason: "Cerveau d'Elena non configuré (aucune ligne)." };
  }

  const provider = (row as unknown as Record<string, string>)[cols.provider];
  const model = (row as unknown as Record<string, string>)[cols.model];
  if (!provider || !model) {
    return { ok: false, reason: "Cerveau d'Elena incomplet pour cette tâche." };
  }

  const SUPPORTED: SupportedProvider[] = ["openai", "anthropic", "openrouter", "deepseek"];
  if (!SUPPORTED.includes(provider as SupportedProvider)) {
    return {
      ok: false,
      reason: `Provider "${provider}" non supporté pour cette tâche (utilise openai, anthropic, openrouter ou deepseek).`,
      providerUnsupported: provider,
    };
  }
  const p = provider as SupportedProvider;

  const apiKey = await getUserKey(userId, p);
  if (!apiKey) {
    return {
      ok: false,
      reason: `Elena ne trouve pas ta clé ${p}. Va dans Réglages → Clés API et colle-la, ou change le provider dans Cerveau d'Elena.`,
      missingProvider: p,
    };
  }

  return {
    ok: true,
    resolved: {
      provider: p,
      model,
      apiKey,
      languageModel: buildLanguageModel(p, apiKey, model),
      fullId: `${p}/${model}`,
    },
  };
}
