/**
 * Lit le routage IA personnalisé de l'utilisateur depuis `elena_ai_routing`.
 *
 * Wiring "Cerveau d'Elena" (page /settings → onglet Cerveau d'Elena) vers le code réel.
 * Le choix Discussion est appliqué réellement dans /api/elena-workspace :
 * OpenAI direct, DeepSeek direct ou OpenRouter selon la ligne sauvegardée.
 */
import { createClient } from "@supabase/supabase-js";
import { pickModelForTask, type TaskType } from "./elena-subagents.server";

type RoutingRow = {
  chat_provider: string; chat_model: string;
  code_provider: string; code_model: string;
  trivial_provider: string; trivial_model: string;
  vision_provider: string; vision_model: string;
  reasoning_provider: string; reasoning_model: string;
};

const cache = new Map<string, { row: RoutingRow | null; expires: number }>();
const TTL_MS = 2_000;

function admin() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getUserRouting(userId: string): Promise<RoutingRow | null> {
  const cached = cache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.row;
  try {
    const { data } = await admin()
      .from("elena_ai_routing" as never)
      .select("chat_provider,chat_model,code_provider,code_model,trivial_provider,trivial_model,vision_provider,vision_model,reasoning_provider,reasoning_model")
      .eq("owner_id", userId)
      .maybeSingle();
    const row = (data as RoutingRow | null) ?? null;
    cache.set(userId, { row, expires: Date.now() + TTL_MS });
    return row;
  } catch {
    return null;
  }
}

/** Mappe une TaskType (sous-agent) vers le couple de colonnes du routage user. */
function taskToColumns(task: TaskType): { provider: keyof RoutingRow; model: keyof RoutingRow } | null {
  switch (task) {
    case "orchestrator": return { provider: "chat_provider", model: "chat_model" };
    case "architect": return { provider: "reasoning_provider", model: "reasoning_model" };
    case "designer": return { provider: "code_provider", model: "code_model" };
    case "developer": return { provider: "code_provider", model: "code_model" };
    case "qa_visual": return { provider: "vision_provider", model: "vision_model" };
    case "trivial_edit": return { provider: "trivial_provider", model: "trivial_model" };
    default: return null;
  }
}

/**
 * Résout le modèle effectif pour une tâche donnée, en tenant compte du choix utilisateur.
 * Retourne provider + model pour que le caller puisse switcher le client LLM.
 * Anthropic/Google directs : pas encore câblés ici → fallback openai.
 */
export async function resolveModelForUser(
  userId: string,
  task: TaskType,
): Promise<{ provider: "openai" | "deepseek" | "openrouter"; model: string }> {
  const fallback = { provider: "openai" as const, model: pickModelForTask(task) };
  const row = await getUserRouting(userId);
  if (!row) return fallback;
  const cols = taskToColumns(task);
  if (!cols) return fallback;
  const provider = row[cols.provider] as string;
  const model = row[cols.model] as string;
  if (!provider || !model) return fallback;
  if (provider === "openai") return { provider: "openai", model };
  if (provider === "deepseek") return { provider: "deepseek", model };
  if (provider === "openrouter") return { provider: "openrouter", model };
  return fallback;
}
