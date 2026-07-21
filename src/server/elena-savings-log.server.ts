/**
 * Persist Elena's per-turn savings into `elena_savings_log` for observability.
 * Fire-and-forget : jamais bloquant, jamais throw.
 */

interface RecordArgs {
  ownerId: string;
  projectId: string;
  route?: string;
  model?: string | null;
  truncParts?: number;
  truncSavedTk?: number;
  dedupParts?: number;
  dedupSavedTk?: number;
  cacheReadTk?: number;
  cacheWriteTk?: number;
  inputTk?: number;
  outputTk?: number;
}

// Claude Sonnet input ≈ $3 / M tokens. Cache read = ~10% → économie 90% = $2.7 / M
// Dédup + troncature : purs tokens économisés en input = $3 / M
const USD_PER_M_INPUT = 3.0;
const CACHE_DISCOUNT = 0.9; // 90% moins cher qu'un vrai read

function estimateSavedUsd(a: RecordArgs): number {
  const structuralSaved = (a.truncSavedTk ?? 0) + (a.dedupSavedTk ?? 0);
  const cacheSaved = (a.cacheReadTk ?? 0) * CACHE_DISCOUNT;
  return ((structuralSaved + cacheSaved) / 1_000_000) * USD_PER_M_INPUT;
}

export function recordElenaSavings(args: RecordArgs): void {
  // async fire-and-forget
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const saved_usd = estimateSavedUsd(args);
      await supabaseAdmin.from("elena_savings_log").insert({
        owner_id: args.ownerId,
        project_id: args.projectId,
        route: args.route ?? "elena-e2b",
        model: args.model ?? null,
        trunc_parts: args.truncParts ?? 0,
        trunc_saved_tk: args.truncSavedTk ?? 0,
        dedup_parts: args.dedupParts ?? 0,
        dedup_saved_tk: args.dedupSavedTk ?? 0,
        cache_read_tk: args.cacheReadTk ?? 0,
        cache_write_tk: args.cacheWriteTk ?? 0,
        input_tk: args.inputTk ?? 0,
        output_tk: args.outputTk ?? 0,
        saved_usd,
      });
    } catch (e) {
      console.warn("[savings-log] insert skipped", e);
    }
  })();
}
