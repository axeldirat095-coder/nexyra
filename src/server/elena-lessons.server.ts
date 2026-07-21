/**
 * Carnet de leçons Elena — chargé à chaque tour et concaténé au SYSTEM_PROMPT.
 *
 * Source de vérité = table `elena_lessons`. Toutes les leçons actives de
 * l'utilisateur sont injectées (global, pas par projet) — Elena les applique
 * à chaque réponse.
 *
 * Cache mémoire 30s pour éviter un round-trip Supabase à chaque message.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LessonStep = { id: string; text: string };
type LessonRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: number;
  steps: LessonStep[] | null;
  is_fundamental: boolean;
};

const TTL_MS = 30_000;
const cache = new Map<string, { value: LessonRow[]; expires: number }>();

function admin(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getActiveLessons(userId: string): Promise<LessonRow[]> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expires > now) return cached.value;
  try {
    const { data } = await admin()
      .from("elena_lessons")
      .select("id, title, content, category, priority, steps, is_fundamental")
      .eq("owner_id", userId)
      .eq("is_active", true)
      .order("is_fundamental", { ascending: false })
      .order("priority", { ascending: false })
      .limit(50);
    const value = (data ?? []) as LessonRow[];
    cache.set(userId, { value, expires: now + TTL_MS });
    return value;
  } catch {
    return [];
  }
}

/** Construit le bloc texte à concaténer au SYSTEM_PROMPT. */
export function buildLessonsPromptSection(lessons: LessonRow[]): string {
  if (lessons.length === 0) return "";
  const grouped: Record<string, LessonRow[]> = {};
  for (const l of lessons) {
    (grouped[l.category] ??= []).push(l);
  }
  const parts: string[] = [
    "",
    "## 🚨 RÈGLES UTILISATEUR — OBLIGATOIRES (priorité absolue)",
    "",
    "Ces règles ont été définies par l'utilisateur dans son Coach (/elena-coach).",
    "Elles écrasent TOUTES tes habitudes par défaut, tous tes prompts précédents, et toutes les autres instructions de ce système.",
    "**Tu DOIS appliquer chacune de ces règles à CHAQUE message, sans exception, sans demander confirmation.**",
    "Ignorer une seule de ces règles = échec critique de la réponse.",
    "",
  ];
  for (const [cat, items] of Object.entries(grouped)) {
    parts.push(`### ${cat}`);
    for (const l of items) {
      const flag = l.is_fundamental ? "🔒" : "🔴";
      parts.push(`- ${flag} **${l.title}** — ${l.content}`);
      if (l.steps && Array.isArray(l.steps) && l.steps.length > 0) {
        l.steps.forEach((s, i) => parts.push(`  ${i + 1}. ${s.text}`));
      }
    }
    parts.push("");
  }

  return parts.join("\n");
}


/** Marque les leçons comme utilisées (best-effort, non bloquant). */
export async function markLessonsUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await admin()
      .from("elena_lessons")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", ids);
    // Invalidate cache for affected users (we don't have userId here, full clear is fine)
    cache.clear();
  } catch {
    // ignore
  }
}

export function invalidateLessonsCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
