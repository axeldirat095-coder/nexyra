/**
 * Axe D — Prompts versionnés + few-shot premium.
 *
 * Charge le prompt actif pour un nom donné depuis prompt_versions, avec un
 * petit cache mémoire (60s) pour éviter un round-trip Supabase à chaque tour.
 *
 * Sentinelle `__USE_CONST__` : si content vaut cette valeur, on garde la
 * constante inline du caller (migration douce, pas de copie monstre dans la DB).
 */
import { createClient } from "@supabase/supabase-js";
import type { ModelMessage } from "ai";

const SENTINEL_USE_CONST = "__USE_CONST__";
const TTL_MS = 60_000;

export type FewShot = { user: string; assistant: string };
export type ActivePrompt = {
  id: string;
  name: string;
  version: number;
  content: string;
  fewShots: FewShot[];
  usesConstFallback: boolean;
};

const cache = new Map<string, { value: ActivePrompt | null; expires: number }>();

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function getActivePrompt(name: string): Promise<ActivePrompt | null> {
  const now = Date.now();
  const cached = cache.get(name);
  if (cached && cached.expires > now) return cached.value;

  try {
    const supa = adminClient();
    const { data } = await supa
      .from("prompt_versions")
      .select("id, name, version, content, few_shots")
      .eq("name", name)
      .eq("is_active", true)
      .maybeSingle();

    let value: ActivePrompt | null = null;
    if (data) {
      const rawShots = Array.isArray(data.few_shots) ? data.few_shots : [];
      const fewShots: FewShot[] = rawShots
        .filter((s: unknown): s is FewShot =>
          !!s && typeof s === "object" && "user" in s && "assistant" in s,
        )
        .slice(0, 6); // cap dur pour limiter coût input tokens
      value = {
        id: data.id,
        name: data.name,
        version: data.version,
        content: data.content,
        fewShots,
        usesConstFallback: data.content === SENTINEL_USE_CONST,
      };
    }
    cache.set(name, { value, expires: now + TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/** Construit les ModelMessages few-shot à préfixer à la conversation utilisateur. */
export function fewShotsToMessages(shots: FewShot[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const s of shots) {
    out.push({ role: "user", content: s.user });
    out.push({ role: "assistant", content: s.assistant });
  }
  return out;
}
