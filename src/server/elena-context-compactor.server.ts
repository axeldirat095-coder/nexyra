/**
 * Elena — Compaction automatique du contexte conversationnel.
 *
 * Objectif : Elena ne « perd plus le fil » sur les longues sessions :
 *   1. Résume les vieux messages en arrière-plan (gpt-5-nano, ~0.001$ par résumé)
 *   2. Stocke le résumé dans workspace_memory.scratch.chat_summary
 *   3. Tronque l'historique envoyé au modèle aux N derniers messages
 *   4. Réinjecte le résumé dans le system prompt
 *
 * Aucune nouvelle table — on réutilise scratch (Json libre).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readMemory, writeMemory, type WorkspaceMemory } from "./elena-memory.server";

type ChatMsgLike = {
  role: string;
  content: string;
  toolCalls?: { id: string; name: string; args?: unknown }[] | undefined;
  toolName?: string | undefined;
};

const TRIGGER_AT = 30; // au-delà → on compresse
const KEEP_TAIL = 16; // nombre de messages récents conservés en clair
const MAX_FACTS = 40;

type ScratchSummary = {
  text: string;
  until_count: number; // nb de messages déjà absorbés dans le résumé
  updated_at: string;
  active_subject?: string; // "sujet actif" détecté (ex: extension Nexyra Optimiseur)
  critical_facts?: string[]; // URLs, IDs, valeurs de config à ne JAMAIS perdre
};

type LockedGoal = { goal: string; set_at?: string };

function readScratchSummary(memory: WorkspaceMemory): ScratchSummary | null {
  const s = memory.scratch?.chat_summary as ScratchSummary | undefined;
  if (!s || typeof s.text !== "string" || typeof s.until_count !== "number") return null;
  return s;
}

function readLockedGoal(memory: WorkspaceMemory): LockedGoal | null {
  const g = memory.scratch?.locked_goal as { goal?: unknown; set_at?: unknown } | undefined;
  if (!g || typeof g.goal !== "string" || !g.goal.trim()) return null;
  return { goal: g.goal.trim(), set_at: typeof g.set_at === "string" ? g.set_at : undefined };
}

/** Persist ou update l'objectif projet verrouillé. Appelé via l'outil `set_project_goal`. */
export async function setLockedGoal(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  goal: string,
): Promise<void> {
  const clean = goal.trim().slice(0, 500);
  if (!clean) return;
  const memory = await readMemory(supabase, userId, workspaceId);
  await writeMemory(
    supabase,
    userId,
    {
      scratch: {
        ...(memory.scratch ?? {}),
        locked_goal: { goal: clean, set_at: new Date().toISOString() },
      },
    },
    workspaceId,
  );
}

function flattenForSummary(msgs: ChatMsgLike[]): string {
  return msgs
    .map((m) => {
      const role = m.role.toUpperCase();
      if (m.role === "tool") return `TOOL[${m.toolName ?? "?"}]: ${m.content?.slice(0, 200) ?? ""}`;
      const calls = m.toolCalls?.length
        ? ` [tools: ${m.toolCalls.map((tc) => tc.name).join(", ")}]`
        : "";
      const txt = (m.content ?? "").slice(0, 1200);
      return `${role}${calls}: ${txt}`;
    })
    .join("\n\n")
    .slice(0, 20000);
}

/**
 * Extrait mécaniquement les faits qu'un résumé LLM tend à oublier :
 * URLs, refs Supabase (xxxxx.supabase.co ou 20-chars), UUIDs, chemins de fichiers,
 * clés d'env, noms de projet en majuscule. Ces faits sont réinjectés VERBATIM
 * dans le bloc résumé pour qu'Elena ne demande jamais deux fois la même URL.
 */
function extractCriticalFacts(msgs: ChatMsgLike[]): string[] {
  const facts = new Set<string>();
  const patterns: RegExp[] = [
    /https?:\/\/[^\s)>\]"']+/gi,
    /\b[a-z0-9]{20}\.supabase\.co\b/gi,
    /\b[a-z0-9]{20}\b(?=\.supabase)/gi,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    /\b(?:sk|pk|eyJ)[A-Za-z0-9_\-.]{20,}\b/g, // clés API (on note qu'elles existent)
    /\b[A-Z][A-Z0-9_]{4,}=[^\s]+/g, // ENV=valeur
    /\bextension\s+[A-Z][\w\-]+/gi,
    /\b(?:projet|project)\s+[A-Z][\w\-]+/gi,
  ];
  for (const m of msgs) {
    const txt = (m.content ?? "").slice(0, 4000);
    for (const re of patterns) {
      const found = txt.match(re);
      if (found) for (const f of found) facts.add(f.trim());
    }
  }
  return Array.from(facts).slice(-MAX_FACTS);
}

type StructuredSummary = { text: string; active_subject: string | null };

async function summarize(
  transcript: string,
  openaiKey: string,
  previousSubject: string | null,
): Promise<StructuredSummary | null> {
  try {
    const sys =
      "Tu compresses une conversation entre un utilisateur et son assistante de dev (Elena). " +
      "IMPÉRATIF : ta sortie DOIT respecter EXACTEMENT ce format Markdown (pas d'enrobage, pas de salutation) :\n\n" +
      "SUJET_ACTIF: <une seule ligne — le projet/tâche en cours PRÉCIS. Ex: 'extension Chrome Nexyra Optimiseur (dossier /extension) — auto-update via GitHub Releases'. " +
      "Ne JAMAIS confondre plusieurs projets : si l'user parle d'une extension Vinted, ce n'est PAS la plateforme SaaS. Reprends le sujet précédent si toujours actif : " +
      (previousSubject ? `« ${previousSubject} »` : "aucun sujet précédent") +
      ">\n\n" +
      "DÉCISIONS:\n- <décision 1 avec le détail concret (nom de fichier, valeur, choix tech)>\n- ...\n\n" +
      "EN_COURS:\n- <ce qui est en train d'être fait>\n\n" +
      "À_FAIRE:\n- <TODO explicites>\n\n" +
      "PRÉFÉRENCES_USER:\n- <règles de comm ou de code exprimées>\n\n" +
      "Règles : garde TOUS les identifiants, URLs, noms de fichiers, valeurs exactes cités par l'user. " +
      "Ne paraphrase JAMAIS une URL ou un ID. Français, factuel, dense, 15-25 lignes max au total.";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5-nano",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const subjectMatch = text.match(/SUJET_ACTIF\s*:\s*(.+)/i);
    const active_subject = subjectMatch?.[1]?.trim() || previousSubject;
    return { text, active_subject };
  } catch {
    return null;
  }
}

export type CompactionResult = {
  messages: ChatMsgLike[]; // historique tronqué à renvoyer au modèle
  summaryBlock: string | null; // bloc à insérer dans system prompt
  compacted: boolean;
};

/**
 * Détecte si le dernier message user contredit une décision persistée
 * (objectif verrouillé, sujet actif, faits critiques). Best-effort, gpt-5-nano.
 * Renvoie un bloc d'alerte si contradiction, sinon null.
 */
async function detectContradiction(
  latestUser: string,
  lockedGoal: LockedGoal | null,
  summary: ScratchSummary | null,
  openaiKey: string,
): Promise<string | null> {
  const hasContext = lockedGoal || summary?.active_subject || (summary?.critical_facts?.length ?? 0) > 0;
  if (!hasContext || latestUser.trim().length < 10) return null;
  try {
    const ctx: string[] = [];
    if (lockedGoal) ctx.push(`OBJECTIF_VERROUILLÉ: ${lockedGoal.goal}`);
    if (summary?.active_subject) ctx.push(`SUJET_ACTIF: ${summary.active_subject}`);
    if (summary?.critical_facts?.length)
      ctx.push(`FAITS: ${summary.critical_facts.slice(-15).join(" | ")}`);

    const sys =
      "Tu compares le dernier message d'un user avec des décisions déjà actées dans sa session Elena. " +
      "Ta seule mission : détecter une CONTRADICTION FRANCHE (ex: change de framework, d'URL Supabase, de projet cible, abandon d'un objectif verrouillé). " +
      "Ignore les précisions, extensions, ou détails complémentaires. " +
      "Réponds STRICTEMENT en JSON : {\"contradicts\": true|false, \"what\": \"<1 phrase courte décrivant la contradiction>\", \"was\": \"<ancienne valeur>\", \"now\": \"<nouvelle valeur>\"}. " +
      "Si aucune contradiction franche, renvoie {\"contradicts\": false}.";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5-nano",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `CONTEXTE ACTÉ:\n${ctx.join("\n")}\n\nDERNIER MESSAGE USER:\n${latestUser.slice(0, 2000)}`,
          },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      contradicts?: boolean;
      what?: string;
      was?: string;
      now?: string;
    };
    if (!parsed.contradicts) return null;
    return (
      `## ⚠️ ALERTE COHÉRENCE — contradiction détectée avec une décision précédente\n` +
      `**${parsed.what ?? "Contradiction détectée"}**\n` +
      (parsed.was ? `- Avant : ${parsed.was}\n` : "") +
      (parsed.now ? `- Maintenant : ${parsed.now}\n` : "") +
      `\n**Consigne : AVANT de coder ou modifier quoi que ce soit, demande à l'user en 1 phrase courte : ` +
      `"Tu veux qu'on abandonne [ancien] pour passer sur [nouveau] ? Je verrouille le nouvel objectif si oui." ` +
      `Ne suppose JAMAIS que le user veut jeter l'ancien sans confirmation.**`
    );
  } catch {
    return null;
  }
}

function extractLatestUserMessage(msgs: ChatMsgLike[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") return msgs[i].content ?? "";
  }
  return "";
}

/**
 * Compacte si nécessaire. Idempotent : si rien à faire, renvoie messages tels quels.
 * Best-effort : toute erreur retombe sur le comportement actuel (pas de troncature).
 */
export async function compactConversation<T extends ChatMsgLike>(
  messages: T[],
  opts: {
    supabase: SupabaseClient;
    userId: string;
    workspaceId: string;
    openaiKey: string | null;
    memory: WorkspaceMemory | null;
  },
): Promise<{ messages: T[]; summaryBlock: string | null; compacted: boolean }> {
  try {
    const existing = opts.memory ? readScratchSummary(opts.memory) : null;
    const lockedGoal = opts.memory ? readLockedGoal(opts.memory) : null;
    const latestUser = extractLatestUserMessage(messages);

    // 🔍 Détection de contradiction (en parallèle du reste, cheap)
    const contradictionPromise: Promise<string | null> = opts.openaiKey
      ? detectContradiction(latestUser, lockedGoal, existing, opts.openaiKey)
      : Promise.resolve(null);

    // 👋 Reprise de session : peu de messages MAIS un résumé existe déjà
    const isSessionResume = messages.length <= 3 && (existing !== null || lockedGoal !== null);

    // Sous le seuil : on renvoie tout, mais on injecte quand même le sujet actif
    if (messages.length <= TRIGGER_AT || !opts.memory || !opts.openaiKey) {
      const contradiction = await contradictionPromise;
      return {
        messages,
        summaryBlock: buildBlock(existing, lockedGoal, contradiction, isSessionResume),
        compacted: false,
      };
    }

    const headCount = messages.length - KEEP_TAIL;
    const head = messages.slice(0, headCount);
    const tail = messages.slice(headCount);

    let current: ScratchSummary | null = existing;

    const needsRefresh = !existing || existing.until_count < headCount - 4;
    if (needsRefresh) {
      const delta = head.slice(existing?.until_count ?? 0);
      const transcript =
        (existing
          ? `Résumé précédent (à mettre à jour, PAS à jeter) :\n${existing.text}\n\n---\nNouveaux échanges :\n`
          : "") + flattenForSummary(delta);
      const fresh = await summarize(transcript, opts.openaiKey, existing?.active_subject ?? null);
      if (fresh) {
        const mergedFacts = extractCriticalFacts(head);
        const combined = new Set<string>([...(existing?.critical_facts ?? []), ...mergedFacts]);
        const facts = Array.from(combined).slice(-MAX_FACTS);

        current = {
          text: fresh.text,
          until_count: headCount,
          updated_at: new Date().toISOString(),
          active_subject: fresh.active_subject ?? undefined,
          critical_facts: facts,
        };
        await writeMemory(
          opts.supabase,
          opts.userId,
          {
            scratch: {
              ...(opts.memory.scratch ?? {}),
              chat_summary: current,
            },
          },
          opts.workspaceId,
        ).catch(() => undefined);
      }
    }

    const contradiction = await contradictionPromise;
    return {
      messages: tail,
      summaryBlock: buildBlock(current, lockedGoal, contradiction, false),
      compacted: true,
    };
  } catch {
    return { messages, summaryBlock: null, compacted: false };
  }
}

function buildBlock(
  s: ScratchSummary | null,
  lockedGoal: LockedGoal | null,
  contradiction: string | null,
  isResume: boolean,
): string | null {
  const parts: string[] = [];

  // ⚠️ Alerte cohérence en TOUT PREMIER pour qu'Elena la traite avant de répondre
  if (contradiction) parts.push(contradiction);

  // 🎯 Objectif projet verrouillé — persiste au-delà des sujets actifs
  if (lockedGoal) {
    const setAt = lockedGoal.set_at ? ` _(verrouillé le ${lockedGoal.set_at.slice(0, 10)})_` : "";
    parts.push(
      `## 🎯 OBJECTIF PROJET VERROUILLÉ${setAt}\n**${lockedGoal.goal}**\n\n_Ne JAMAIS dévier de cet objectif sauf demande EXPLICITE de l'user. Si un choix technique semble s'écarter, rappeler l'objectif d'abord._`,
    );
  }

  // 👋 Reprise de session
  if (isResume) {
    parts.push(
      `## 👋 REPRISE DE SESSION\nL'user revient sur ce projet après une pause. TON PREMIER MESSAGE doit rappeler brièvement (2-3 lignes max) où on en était (sujet actif + dernière tâche en cours), PAS repartir de zéro. Ne redemande AUCUNE info déjà dans le contexte ci-dessous.`,
    );
  }

  if (s?.active_subject) {
    parts.push(
      `## 📍 Sujet actif (ne pas confondre avec d'autres projets)\n**${s.active_subject}**`,
    );
  }
  if (s?.critical_facts?.length) {
    parts.push(
      `## 🔒 Faits critiques à ne JAMAIS oublier ni redemander\n` +
        s.critical_facts.map((f) => `- \`${f}\``).join("\n"),
    );
  }
  if (s?.text) {
    parts.push(
      `## Résumé de la conversation précédente (compactée automatiquement)\n${s.text}\n\n_Continue à partir d'ici. Si l'user cite un projet/URL/ID déjà listé ci-dessus, NE le redemande PAS._`,
    );
  }

  return parts.length ? parts.join("\n\n") : null;
}

/**
 * Charge le profil utilisateur permanent stocké dans elena_settings.preferences.user_profile.
 * Renvoie un bloc prêt à concaténer au system prompt, ou null si vide.
 */
export async function loadUserProfileBlock(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("elena_settings")
      .select("preferences")
      .eq("owner_id", userId)
      .maybeSingle();
    const prefs = (data?.preferences ?? {}) as { user_profile?: string };
    const profile = prefs.user_profile?.trim();
    if (!profile) return null;
    return `## Profil utilisateur (à respecter à chaque réponse)\n${profile}`;
  } catch {
    return null;
  }
}
