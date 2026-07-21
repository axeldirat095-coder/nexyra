/**
 * Axe F — Multi-provider (DeepSeek alternative bon marché).
 *
 * DeepSeek est compatible OpenAI API (base URL `https://api.deepseek.com/v1`).
 * Pour les tâches triviales/dev simples, DeepSeek coûte ~10× moins qu'OpenAI
 * tout en gardant une qualité acceptable.
 *
 * Stratégie : si l'utilisateur a une clé DeepSeek active ET que la tâche est
 * éligible (trivial_edit / developer avec brief court) → DeepSeek. Sinon
 * fallback OpenAI (BYOK strict, jamais Lovable AI — voir mem://product/agent-providers).
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { TaskType } from "./elena-subagents.server";
import { createOpenRouterCacheFetch } from "./openrouter-cache-fetch.server";

export type ProviderName = "openai" | "deepseek" | "openrouter";
type OpenAIClient = ReturnType<typeof createOpenAI>;
type CompatibleClient = ReturnType<typeof createOpenAICompatible>;
type ProviderClient = OpenAIClient | CompatibleClient;

export type ResolvedProvider = {
  provider: ProviderName;
  client: ProviderClient;
  /** Modèle à passer à client(modelName). Spécifique au provider. */
  modelName: string;
};

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Récupère une clé IA de l'utilisateur (NULL si absente). */
export async function getUserProviderKey(userId: string, provider: ProviderName): Promise<string | null> {
  try {
    const supa = adminClient();
    const { data } = await supa.rpc(
      "get_api_key_decrypted" as never,
      { _owner_id: userId, _provider: provider } as never,
    );
    if (typeof data === "string" && data.trim()) return data;

    const serviceCandidates = [provider, `${provider}_api_key`];
    for (const service of serviceCandidates) {
      const { data: externalData } = await supa.rpc(
        "get_external_key_decrypted" as never,
        { _owner_id: userId, _service: service } as never,
      );
      if (typeof externalData === "string" && externalData.trim()) return externalData;
    }
    return null;
  } catch {
    return null;
  }
}

/** Récupère la clé DeepSeek de l'utilisateur (NULL si absente). */
export async function getUserDeepSeekKey(userId: string): Promise<string | null> {
  return getUserProviderKey(userId, "deepseek");
}

export function createProviderClient(provider: ProviderName, apiKey: string): ProviderClient {
  if (provider === "deepseek") {
    return createOpenAICompatible({ apiKey, baseURL: DEEPSEEK_BASE_URL, name: "deepseek" });
  }
  if (provider === "openrouter") {
    return createOpenAICompatible({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      name: "openrouter",
      headers: {
        "HTTP-Referer": "https://nexyra.app",
        "X-Title": "Nexyra Elena",
      },
      // Chantier 5 — injecte cache_control Anthropic sur system + historique
      // pour les modèles Claude via OpenRouter (no-op sinon).
      fetch: createOpenRouterCacheFetch(),
    });
  }
  return createOpenAI({ apiKey });
}

/**
 * IMPORTANT : on force `client.chat(model)` pour TOUS les providers.
 * - DeepSeek / OpenRouter : compatibles OpenAI uniquement via `/chat/completions`
 *   (sinon 404 Not Found sur `/responses`).
 * - OpenAI : l'API Responses (utilisée par défaut par `client(model)`) exige
 *   que chaque message assistant des modèles de reasoning (gpt-5*, o1*) soit
 *   accompagné de son item `reasoning` (`rs_...`). Sans état serveur, le 2ᵉ tour
 *   plante avec "Item 'msg_...' was provided without its required 'reasoning' item".
 *   Chat Completions n'a pas ce problème → on prend toujours `.chat()`.
 */
export function createProviderModel(
  provider: ProviderName,
  client: ProviderClient,
  modelName: string,
): LanguageModel {
  if (provider === "openrouter" || provider === "deepseek") {
    return (client as CompatibleClient).chatModel(modelName);
  }
  const openaiClient = client as OpenAIClient;
  return openaiClient.chat(modelName as Parameters<typeof openaiClient.chat>[0]);
}

function isDeepSeekEligible(task: TaskType, briefLen: number): boolean {
  if (task === "trivial_edit") return true;
  if (task === "developer" && briefLen < 800) return true;
  if (task === "architect" && briefLen < 400) return true;
  return false;
}

/**
 * Résout le provider à utiliser pour un appel LLM donné.
 * Si DeepSeek dispo et tâche éligible → DeepSeek. Sinon OpenAI.
 */
export function resolveProvider(args: {
  task: TaskType;
  briefLen: number;
  openaiKey: string;
  deepseekKey: string | null;
  preferredOpenAIModel: string;
}): ResolvedProvider {
  if (args.deepseekKey && isDeepSeekEligible(args.task, args.briefLen)) {
    return {
      provider: "deepseek",
      client: createProviderClient("deepseek", args.deepseekKey),
      modelName: DEEPSEEK_DEFAULT_MODEL,
    };
  }
  return {
    provider: "openai",
    client: createOpenAI({ apiKey: args.openaiKey }),
    modelName: args.preferredOpenAIModel.replace(/^openai\//, ""),
  };
}
