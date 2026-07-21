/**
 * Axe E — Observabilité Elena.
 * Helper best-effort pour enregistrer chaque appel LLM (latence, tokens, cache).
 * N'échoue jamais : si l'insert plante, on log et on continue (jamais bloquant).
 */
import { createClient } from "@supabase/supabase-js";

export type MetricRecord = {
  userId?: string | null;
  conversationId?: string | null;
  endpoint: string; // 'workspace' | 'sub-architect' | 'sub-designer' | 'sub-developer' | 'sub-qa' | ...
  taskType?: string | null;
  model?: string | null;
  cacheType?: "exact" | "semantic" | "miss" | null;
  promptName?: string | null;
  promptVersion?: number | null;
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
};

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function recordMetric(m: MetricRecord): Promise<void> {
  try {
    const supa = adminClient();
    await supa.from("elena_metrics").insert({
      user_id: m.userId ?? null,
      conversation_id: m.conversationId ?? null,
      endpoint: m.endpoint,
      task_type: m.taskType ?? null,
      model: m.model ?? null,
      cache_type: m.cacheType ?? null,
      prompt_name: m.promptName ?? null,
      prompt_version: m.promptVersion ?? null,
      tokens_input: m.tokensInput ?? 0,
      tokens_output: m.tokensOutput ?? 0,
      latency_ms: m.latencyMs,
      success: m.success,
      error_message: m.errorMessage ?? null,
    });
  } catch (e) {
    console.warn("[elena-metrics] insert failed (non-blocking)", (e as Error).message);
  }
}

/** Wrap async work, mesure latence, push métrique. Renvoie le résultat brut. */
export async function withMetric<T>(
  base: Omit<MetricRecord, "latencyMs" | "success" | "errorMessage">,
  fn: () => Promise<T>,
  extract?: (r: T) => Partial<Pick<MetricRecord, "tokensInput" | "tokensOutput" | "model" | "cacheType">>,
): Promise<T> {
  const start = Date.now();
  try {
    const r = await fn();
    const extra = extract ? extract(r) : {};
    void recordMetric({
      ...base,
      ...extra,
      latencyMs: Date.now() - start,
      success: true,
    });
    return r;
  } catch (e) {
    void recordMetric({
      ...base,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
