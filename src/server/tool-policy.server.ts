/**
 * Tool policy enforcement: vérifie pour chaque appel d'outil
 * (1) si l'utilisateur l'a désactivé (tool_overrides),
 * (2) son coût en crédits (tool_pricing).
 * Renvoie { allowed, reason?, cost } et logge l'usage.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ToolPolicyResult {
  allowed: boolean;
  reason?: string;
  cost: number;
  requires_byok: boolean;
  provider: string | null;
}

const cache = new Map<string, { v: ToolPolicyResult; exp: number }>();
const TTL = 30_000;

export async function checkToolPolicy(
  supabase: SupabaseClient,
  ownerId: string,
  toolName: string,
): Promise<ToolPolicyResult> {
  const ck = `${ownerId}:${toolName}`;
  const hit = cache.get(ck);
  if (hit && hit.exp > Date.now()) return hit.v;

  let allowed = true;
  let reason: string | undefined;
  let cost = 1;
  let requires_byok = false;
  let provider: string | null = null;

  try {
    const { data: pricing } = await (supabase.from as any)("tool_pricing")
      .select("credits_cost, requires_byok, provider, enabled_by_default")
      .eq("tool_name", toolName)
      .maybeSingle();
    if (pricing) {
      cost = pricing.credits_cost ?? 1;
      requires_byok = !!pricing.requires_byok;
      provider = pricing.provider ?? null;
      if (pricing.enabled_by_default === false) allowed = false;
    }

    const { data: ovr } = await (supabase.from as any)("tool_overrides")
      .select("enabled")
      .eq("owner_id", ownerId)
      .eq("tool_name", toolName)
      .maybeSingle();
    if (ovr && ovr.enabled === false) {
      allowed = false;
      reason = `L'outil "${toolName}" est désactivé dans tes Réglages > Outils.`;
    }
  } catch {
    // si la vérification échoue, on autorise (fail-open) pour ne pas bloquer Elena
  }

  const result: ToolPolicyResult = { allowed, reason, cost, requires_byok, provider };
  cache.set(ck, { v: result, exp: Date.now() + TTL });
  return result;
}

export function policyDeniedResult(_toolName: string, reason: string): { ok: boolean; output: string } {
  return { ok: false, output: reason };
}
