/**
 * State machine de run pour Elena.
 * Empêche Elena de re-proposer le même plan deux fois de suite ou de boucler
 * sur la même action (ex : finalise → re-propose les mêmes 5 étapes).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

/** Hash très simple (FNV-1a 32-bit en hex) — déterministe, pas de dépendance crypto. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Construit une signature stable pour un plan/réponse Elena.
 * On normalise (lowercase, strip espaces) et on ne garde que la 1ʳᵉ partie significative
 * pour rester robuste aux légères variations textuelles.
 */
export function planSignature(text: string, lastTool: string | null): string {
  const norm = text
    .toLowerCase()
    .replace(/[\s\n\r]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .slice(0, 800);
  return `${lastTool ?? "none"}:${fnv1a(norm)}`;
}

export interface AgentRunUpdate {
  conversationId: string;
  ownerId: string;
  finalText: string;
  lastTool: string | null;
  expectedNextAction?: string | null;
  screenshotUrl?: string | null;
}

export interface AgentRunVerdict {
  repeatCount: number;
  isRepeat: boolean;
  /** Hint à injecter en system message si Elena boucle. */
  loopHint: string | null;
}

/**
 * Enregistre l'état de fin de tour et renvoie un verdict :
 * - repeatCount ≥ 2 → on injecte un hint dur "tu re-proposes le même plan, EXÉCUTE."
 */
export async function recordAgentTurn(
  supabase: SB,
  update: AgentRunUpdate,
): Promise<AgentRunVerdict> {
  const sig = planSignature(update.finalText ?? "", update.lastTool);

  try {
    // RPC typé en `unknown` car non présent dans les types générés.
    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("agent_run_state_record", {
      _conversation_id: update.conversationId,
      _owner_id: update.ownerId,
      _plan_signature: sig,
      _last_tool: update.lastTool,
      _expected_next: update.expectedNextAction ?? null,
      _screenshot_url: update.screenshotUrl ?? null,
    });

    if (error || !data || typeof data !== "object") {
      return { repeatCount: 0, isRepeat: false, loopHint: null };
    }

    const repeatCount = Number((data as { repeat_count?: unknown }).repeat_count ?? 0);
    const isRepeat = Boolean((data as { is_repeat?: unknown }).is_repeat);

    let loopHint: string | null = null;
    if (repeatCount >= 1) {
      loopHint =
        "🛑 BOUCLE DÉTECTÉE : tu viens de re-proposer EXACTEMENT le même plan / la même réponse que le tour précédent. " +
        "Interdit de re-décrire ce que tu vas faire — TU PASSES À L'EXÉCUTION MAINTENANT (`write_file`, `line_replace`, `build_check`, `screenshot_qa`). " +
        "Si tu manques d'info, pose UNE seule question explicite avec « ? » et arrête. Sinon, AGIS dans ce tour.";
    }
    if (repeatCount >= 2) {
      loopHint =
        "🚨 BOUCLE CRITIQUE (×3) : tu redis la même chose pour la 3ᵉ fois. ARRÊT FORCÉ. " +
        "Réponds UN SEUL message court : soit tu poses 1 question précise (« ? »), soit tu déclares « bloqué : <raison technique exacte> ». PAS de plan, PAS de listes.";
    }

    return { repeatCount, isRepeat, loopHint };
  } catch {
    return { repeatCount: 0, isRepeat: false, loopHint: null };
  }
}

/** Récupère le dernier screenshot stocké pour ré-injection multimodale au prochain tour. */
export async function fetchLastScreenshot(
  supabase: SB,
  conversationId: string,
): Promise<string | null> {
  try {
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{ data: { last_screenshot_url: string | null } | null }>;
          };
        };
      };
    })
      .from("agent_run_state")
      .select("last_screenshot_url")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    return data?.last_screenshot_url ?? null;
  } catch {
    return null;
  }
}
