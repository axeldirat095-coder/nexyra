/**
 * LOT #2 — Mémoire long-terme projet
 *
 * Maintient un résumé condensé du projet (décisions, contexte, état actuel).
 * Régénéré tous les ~30 messages assistant via gpt-5-nano (très peu cher).
 *
 * Le résumé est injecté dans le contexte agent à chaque tour, ce qui évite
 * de relire 200+ messages d'historique → Elena reste cohérente sur la durée
 * sans surcoût significatif.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUMMARY_REFRESH_EVERY = 30; // tous les 30 messages assistant
const SUMMARY_MIN_MESSAGES = 8;   // pas la peine en deçà
const MAX_HISTORY_FOR_SUMMARY = 60; // borne haute pour limiter le coût

/**
 * Compte les messages assistant du projet et décide s'il faut régénérer.
 */
async function shouldRegenerate(
  admin: SupabaseClient<Database>,
  projectId: string,
): Promise<{ regen: boolean; assistantCount: number; lastCount: number }> {
  const { data: proj } = await admin
    .from("projects")
    .select("messages_count_at_summary")
    .eq("id", projectId)
    .maybeSingle();
  const lastCount = proj?.messages_count_at_summary ?? 0;

  // Compte les messages assistant via les conversations du projet
  const { data: convs } = await admin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId);
  const convIds = (convs ?? []).map((c) => c.id);
  if (convIds.length === 0) {
    return { regen: false, assistantCount: 0, lastCount };
  }

  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", convIds)
    .eq("role", "assistant");

  const assistantCount = count ?? 0;
  const delta = assistantCount - lastCount;
  const regen = assistantCount >= SUMMARY_MIN_MESSAGES && delta >= SUMMARY_REFRESH_EVERY;
  return { regen, assistantCount, lastCount };
}

/**
 * Génère un résumé condensé via gpt-5-nano (modèle le plus économique).
 * Fire-and-forget : ne bloque jamais le tour agent.
 */
export async function maybeRegenerateProjectSummary(opts: {
  admin: SupabaseClient<Database>;
  projectId: string;
  apiKey: string; // OpenAI key
}): Promise<void> {
  try {
    const { regen, assistantCount } = await shouldRegenerate(opts.admin, opts.projectId);
    if (!regen) return;

    // 1. Charge le projet + memories pinned + N derniers messages
    const [{ data: proj }, { data: pinnedMems }, { data: convs }] = await Promise.all([
      opts.admin
        .from("projects")
        .select("name, type, description, metadata, long_term_summary")
        .eq("id", opts.projectId)
        .maybeSingle(),
      opts.admin
        .from("project_memory")
        .select("kind, title, body")
        .eq("project_id", opts.projectId)
        .is("archived_at", null)
        .eq("is_pinned", true)
        .limit(20),
      opts.admin
        .from("conversations")
        .select("id")
        .eq("project_id", opts.projectId),
    ]);
    if (!proj) return;

    const convIds = (convs ?? []).map((c) => c.id);
    if (convIds.length === 0) return;

    const { data: msgs } = await opts.admin
      .from("messages")
      .select("role, content, created_at")
      .in("conversation_id", convIds)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_FOR_SUMMARY);

    const recent = (msgs ?? []).reverse();
    if (recent.length === 0) return;

    const meta = (proj.metadata ?? {}) as Record<string, unknown>;
    const brief = typeof meta.brief === "string" ? meta.brief : "";

    const transcript = recent
      .map((m) => `[${m.role}] ${String(m.content ?? "").slice(0, 800)}`)
      .join("\n\n");

    const pinnedBlock = (pinnedMems ?? [])
      .map((m) => `- [${m.kind}] ${m.title} : ${m.body}`)
      .join("\n");

    const previous = proj.long_term_summary
      ? `\n\nRésumé précédent (à compléter, pas à reproduire) :\n${proj.long_term_summary}`
      : "";

    const prompt = `Tu génères le RÉSUMÉ LONG-TERME d'un projet pour une IA agent.

Ce résumé sera injecté dans son contexte à chaque tour pour qu'elle reste cohérente sans relire toute l'historique.

PROJET : ${proj.name} (${proj.type})
${proj.description ? `Description : ${proj.description}` : ""}
${brief ? `Brief : ${brief}` : ""}

${pinnedBlock ? `RÈGLES PINNÉES :\n${pinnedBlock}\n` : ""}
${previous}

TRANSCRIPT RÉCENT (${recent.length} messages) :
${transcript}

CONSIGNES :
- Max 400 mots, en français
- Structure : (1) État actuel du projet en 2-3 lignes, (2) Décisions clés prises, (3) Composants/features livrés, (4) Points en cours / à venir
- PAS de chichi narratif, pas de "L'utilisateur a demandé…"
- Format : bullets courts, tirets, dense
- Conserve les noms exacts (composants, fichiers, sections)
- Si une décision contredit le résumé précédent, c'est la nouvelle qui gagne`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
      }),
    });

    if (!resp.ok) {
      console.warn("[project-summary] OpenAI error", resp.status);
      return;
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = json.choices?.[0]?.message?.content?.trim();
    if (!summary || summary.length < 50) return;

    await opts.admin
      .from("projects")
      .update({
        long_term_summary: summary,
        summary_updated_at: new Date().toISOString(),
        messages_count_at_summary: assistantCount,
      })
      .eq("id", opts.projectId);

    console.log(
      `[project-summary] regenerated for ${opts.projectId} — ${summary.length} chars, ${assistantCount} msgs`,
    );
  } catch (err) {
    // Fire-and-forget : on ne bloque jamais le tour agent
    console.warn("[project-summary] failed (non-blocking)", err);
  }
}
