/**
 * Multi-provider AI helper with automatic fallback.
 * Used by elena-chat. NON-streaming for fallback providers (simpler & robust).
 *
 * Order of attempts: primary → fallback chain in user's elena_settings.
 * Each attempt failure is logged to audit_logs.
 *
 * BYOK : les clés des providers (sauf "lovable") proviennent de la table
 * `external_keys` via la RPC SECURITY DEFINER `get_external_key_decrypted`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "groq"
  | "openrouter"
  | "cerebras"
  | "mistral"
  | "xai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  provider: ProviderName;
  modelUsed: string;
}

export class ProviderError extends Error {
  constructor(
    public provider: ProviderName,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ----- Config par provider -----

interface ProviderConfig {
  baseUrl: string;
  defaultModel: string;
  /** Service key utilisé dans la table external_keys (généralement === provider). */
  externalService: string;
}

const PROVIDER_CONFIG: Record<Exclude<ProviderName, "anthropic" | "google">, ProviderConfig> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5-mini",
    externalService: "openai",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    externalService: "deepseek",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    externalService: "groq",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4.5",
    externalService: "openrouter",
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    externalService: "cerebras",
  },
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    externalService: "mistral",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    externalService: "xai",
  },
};

const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";
const GOOGLE_DEFAULT_MODEL = "gemini-2.5-flash";

export function getExternalServiceForProvider(provider: ProviderName): string {
  if (provider === "anthropic") return "anthropic";
  if (provider === "google") return "google";
  return PROVIDER_CONFIG[provider].externalService;
}

// ----- Provider calls (NON-streaming, simple) -----

async function callOpenAICompat(
  provider: Exclude<ProviderName, "anthropic" | "google">,
  key: string,
  model: string,
  messages: ChatMessage[],
): Promise<ProviderResult> {
  const cfg = PROVIDER_CONFIG[provider];
  const useModel = provider === "openai" ? model : cfg.defaultModel;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://nexyra.app";
    headers["X-Title"] = "Nexyra Elena";
  }
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: useModel, messages }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ProviderError(provider, res.status, txt.slice(0, 200) || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
    provider,
    modelUsed: `${provider}/${useModel}`,
  };
}

async function callAnthropic(key: string, messages: ChatMessage[]): Promise<ProviderResult> {
  const sys = messages.find((m) => m.role === "system")?.content;
  const conv = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 4096,
      system: sys,
      messages: conv.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ProviderError("anthropic", res.status, txt.slice(0, 200) || `HTTP ${res.status}`);
  }
  const json = await res.json();
  const text = (json.content ?? []).map((c: { type: string; text?: string }) => c.text ?? "").join("");
  return {
    text,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
    provider: "anthropic",
    modelUsed: `anthropic/${ANTHROPIC_DEFAULT_MODEL}`,
  };
}

async function callGoogle(key: string, messages: ChatMessage[]): Promise<ProviderResult> {
  const sys = messages.find((m) => m.role === "system")?.content;
  const conv = messages.filter((m) => m.role !== "system");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents: conv.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ProviderError("google", res.status, txt.slice(0, 200) || `HTTP ${res.status}`);
  }
  const json = await res.json();
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  return {
    text,
    tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
    provider: "google",
    modelUsed: `google/${GOOGLE_DEFAULT_MODEL}`,
  };
}

async function callOne(
  provider: ProviderName,
  key: string,
  openaiModel: string,
  messages: ChatMessage[],
): Promise<ProviderResult> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(key, messages);
    case "google":
      return callGoogle(key, messages);
    case "openai":
    case "deepseek":
    case "groq":
    case "openrouter":
    case "cerebras":
    case "mistral":
    case "xai":
      return callOpenAICompat(provider, key, openaiModel, messages);
  }
}

// ----- Helper BYOK : factory de fetchUserKey à partir des external_keys -----

/**
 * Crée un `fetchUserKey` qui lit la clé chiffrée depuis `external_keys`
 * via la RPC SECURITY DEFINER. Utilise un client supabase agissant comme
 * l'utilisateur (auth-middleware) pour respecter RLS + ownership.
 */
export function makeExternalKeyFetcher(
  supabase: SupabaseClient<Database>,
  userId: string,
): (provider: ProviderName) => Promise<string | null> {
  return async (provider) => {
    const service = getExternalServiceForProvider(provider);
    try {
      const { data, error } = await supabase.rpc("get_external_key_decrypted", {
        _owner_id: userId,
        _service: service,
      });
      if (error || !data) return null;
      const key = typeof data === "string" ? data : null;
      if (!key) return null;
      // mark used (best effort, ignore errors)
      void supabase
        .rpc("mark_external_key_used", { _owner_id: userId, _service: service })
        .then(() => undefined);
      return key;
    } catch {
      return null;
    }
  };
}

// ----- Orchestrator with fallback -----

export interface FallbackOptions {
  primaryProvider: ProviderName;
  primaryKey: string;
  primaryOpenAIModel: string;
  fallbackChain: ProviderName[]; // ordered list, may include primary (will skip)
  messages: ChatMessage[];
  /** Per-user fetcher for fallback keys. Returns null if user has no key for that provider. */
  fetchUserKey: (provider: ProviderName) => Promise<string | null>;
  /** Optional logger for each attempt outcome */
  onAttempt?: (info: {
    provider: ProviderName;
    ok: boolean;
    status?: number;
    error?: string;
  }) => void;
}

export async function callWithFallback(opts: FallbackOptions): Promise<ProviderResult> {
  const attempts: Array<{ provider: ProviderName; key: string }> = [];

  // 1. primary
  attempts.push({ provider: opts.primaryProvider, key: opts.primaryKey });

  // 2. chain (skip primary, dedupe)
  const seen = new Set<ProviderName>([opts.primaryProvider]);
  for (const p of opts.fallbackChain) {
    if (seen.has(p)) continue;
    const k = await opts.fetchUserKey(p);
    if (k) attempts.push({ provider: p, key: k });
    seen.add(p);
  }

  let lastErr: ProviderError | null = null;
  for (const a of attempts) {
    try {
      const result = await callOne(a.provider, a.key, opts.primaryOpenAIModel, opts.messages);
      opts.onAttempt?.({ provider: a.provider, ok: true });
      return result;
    } catch (e) {
      const err =
        e instanceof ProviderError
          ? e
          : new ProviderError(a.provider, 0, e instanceof Error ? e.message : "unknown");
      lastErr = err;
      opts.onAttempt?.({ provider: a.provider, ok: false, status: err.status, error: err.message });
      // Only fall back on "transient/auth/rate" classes; on 400 (bad request) bail.
      if (err.status === 400) break;
      continue;
    }
  }

  throw lastErr ?? new ProviderError("openai", 500, "All providers failed");
}

export async function logFallbackEvent(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string,
  details: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "ai_provider_fallback",
      resource_type: "elena_chat",
      details: details as never,
    });
  } catch {
    // best effort
  }
}
