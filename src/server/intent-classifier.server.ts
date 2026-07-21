/**
 * Classifieur d'intent serveur basé sur un mini-LLM (Lovable AI Gateway, gpt-5-nano)
 * avec cache (prompt_cache) et fallback regex via detectIntent.
 *
 * Sortie unifiée :
 * - kind  : "build" | "chat" | "question" | "continuation" | "diagnostic"
 * - level : "conversation" | "simple" | "complex" | "design"  (compatible existant)
 */

export type IntentKind = "build" | "chat" | "question" | "continuation" | "diagnostic";
export type IntentLevel = "conversation" | "simple" | "complex" | "design";

export interface IntentResult {
  kind: IntentKind;
  level: IntentLevel;
  confidence: number;
  source: "llm" | "regex" | "cache";
}

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const NANO_MODEL = "openai/gpt-5-nano";
const CLASSIFY_TIMEOUT_MS = 4_000;

/** Hash FNV-1a 32-bit. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const SYSTEM_PROMPT = [
  "Tu es un classifieur d'intent ULTRA RAPIDE pour un agent dev IA.",
  "Tu reçois UN message utilisateur (français) et son contexte (file_count du projet).",
  "Tu réponds UNIQUEMENT en JSON strict, sans texte autour, avec ces champs :",
  '{ "kind": "build|chat|question|continuation|diagnostic", "level": "conversation|simple|complex|design", "confidence": 0.0..1.0 }',
  "",
  "Définitions :",
  "- build         : l'utilisateur demande de créer / modifier / coder du code, des fichiers, des composants, une page, une feature.",
  "- chat          : salutations, remerciements, smalltalk, questions de vie courante (météo, recette).",
  "- question      : question sur le projet, sur Elena, sur 'comment ça marche', explication.",
  "- continuation  : 'continue', 'finalise', 'OK', 'go', 'lance', 'termine', 'on reprend' — l'utilisateur veut qu'Elena POURSUIVE le travail en cours.",
  "- diagnostic    : l'utilisateur signale un bug visuel/preview/erreur ('je vois plus la preview', 'écran blanc', 'ça marche plus') — JAMAIS recréer.",
  "",
  "Niveau (pour routing modèle) :",
  "- conversation : kind=chat OU kind=diagnostic OU question courte triviale → modèle nano.",
  "- simple       : build mineur (1 fichier, edit ponctuel) → modèle mini.",
  "- complex      : refacto, debug, archi, multi-fichier → modèle reasoning.",
  "- design       : nouvelle UI, landing, page complète, refonte visuelle → modèle premium.",
  "",
  "Règles dures :",
  "- Si projet vide (file_count ≤ 6) ET build explicite → kind=build, level=design.",
  "- Si message contient 'continue', 'finalise', 'reprends', 'on continue' → kind=continuation.",
  "- Si message décrit un dysfonctionnement preview → kind=diagnostic, level=conversation.",
  "- Toujours répondre en < 80 tokens.",
].join("\n");

/** Fallback regex (copie minimale de detectIntent existant). */
function regexClassify(message: string, fileCount: number): IntentResult {
  const t = message.toLowerCase().trim();
  const continuationKw =
    /\b(continue|continu|finalise|finalis|reprend|reprends|on reprend|relance|termine|finis|go|lance|poursui|on continue|ok lance|vas-y)\b/;
  const previewIssueKw =
    /\b(preview|aperçu|apercu|écran blanc|ecran blanc|page blanche|s'affiche pas|saffiche pas|marche plus|fonctionne plus|cassé|casse|broken|blank|vide|disparu|disparait|n'apparait pas|napparait pas|rien ne s'affiche|rien ne saffiche|loading infini)\b/;
  const buildSignal =
    /\b(crée|cree|build|fais|génère|genere|ajoute|modifie|refais|recrée|recree|implémente|implemente|page|composant|component|écran|screen|landing|hero|button|formulaire|fix|corrige|bug|debug|refactor|optimise|app|site|interface|ui|ux|api|backend|database|table|migration|fichier|hook|route)\b/;
  const conversationKw =
    /^(salut|bonjour|hello|hi |coucou|merci|ok|d'accord|daccord|super|parfait|cool|génial|genial|bravo|wow|oui|non|peut-être|comment ça va|qui es-tu|que peux-tu|c'est quoi|qu'est-ce que|explique|dis-moi|raconte|pourquoi|météo|recette|capital|histoire|définition|definition|différence|difference|traduit)/;
  const designKw =
    /\b(design|hero|landing|page d'accueil|ui|ux|interface|refonte|premium|moderne|magnifique|stunning|app|application|mobile|pwa|dashboard|tableau de bord|onboarding|saas|page|formulaire|écran|screen|portfolio|blog|e-?commerce|marketplace|booking|messagerie)\b/;
  const heavyKw =
    /\b(refactor|refacto|architecture|optimise|optimiser|debug|comprendre pourquoi|analyse|migration|sécur|perform|tout.{0,20}fichier|complet|complète)\b/;

  if (previewIssueKw.test(t))
    return { kind: "diagnostic", level: "conversation", confidence: 0.9, source: "regex" };
  if (continuationKw.test(t) && t.length < 80)
    return { kind: "continuation", level: "complex", confidence: 0.85, source: "regex" };
  if (t.length < 120 && conversationKw.test(t) && !buildSignal.test(t))
    return { kind: "chat", level: "conversation", confidence: 0.85, source: "regex" };
  const emptyProject = fileCount <= 6;
  if (emptyProject && message.trim().length > 12 && buildSignal.test(t))
    return { kind: "build", level: "design", confidence: 0.85, source: "regex" };
  if (designKw.test(t) && buildSignal.test(t))
    return { kind: "build", level: "design", confidence: 0.8, source: "regex" };
  if (message.length > 220 || heavyKw.test(t) || fileCount > 30)
    return { kind: "build", level: "complex", confidence: 0.7, source: "regex" };
  if (buildSignal.test(t)) return { kind: "build", level: "simple", confidence: 0.7, source: "regex" };
  return { kind: "question", level: "conversation", confidence: 0.6, source: "regex" };
}

interface CacheClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
}

/**
 * Classifie l'intent. Tente LLM nano, fallback regex en cas d'erreur/timeout.
 * Cache via prompt_cache (réutilisable cross-tenant car déterministe).
 */
export async function classifyIntent(
  message: string,
  fileCount: number,
  opts: { lovableApiKey?: string | null; cache?: CacheClient | null } = {},
): Promise<IntentResult> {
  const trimmed = message.trim();
  if (trimmed.length < 2) {
    return { kind: "chat", level: "conversation", confidence: 0.5, source: "regex" };
  }

  const cacheHash = `intent:${fnv1a(trimmed.slice(0, 600))}:${fileCount > 6 ? "full" : "empty"}`;

  // 1) Cache hit ?
  if (opts.cache) {
    try {
      const { data } = await opts.cache.rpc("get_or_increment_cache", {
        _hash: cacheHash,
        _model: NANO_MODEL,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (row && typeof (row as { response?: unknown }).response === "string") {
        try {
          const parsed = JSON.parse((row as { response: string }).response) as IntentResult;
          if (parsed.kind && parsed.level)
            return { ...parsed, source: "cache" };
        } catch {
          /* corrupt cache row, ignore */
        }
      }
    } catch {
      /* ignore cache errors */
    }
  }

  // 2) Pas de clé → fallback direct
  if (!opts.lovableApiKey) {
    return regexClassify(message, fileCount);
  }

  // 3) Appel LLM nano avec timeout court
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CLASSIFY_TIMEOUT_MS);
    const resp = await fetch(LOVABLE_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NANO_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `file_count=${fileCount}\nmessage="""${trimmed.slice(0, 1200)}"""`,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 80,
      }),
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);

    if (!resp || !resp.ok) {
      return regexClassify(message, fileCount);
    }

    const json = (await resp.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    const raw = json?.choices?.[0]?.message?.content ?? "";
    if (!raw) return regexClassify(message, fileCount);

    let parsed: Partial<IntentResult> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<IntentResult>;
    } catch {
      return regexClassify(message, fileCount);
    }
    const validKinds: IntentKind[] = ["build", "chat", "question", "continuation", "diagnostic"];
    const validLevels: IntentLevel[] = ["conversation", "simple", "complex", "design"];
    if (!parsed?.kind || !validKinds.includes(parsed.kind)) return regexClassify(message, fileCount);
    if (!parsed?.level || !validLevels.includes(parsed.level)) return regexClassify(message, fileCount);

    const result: IntentResult = {
      kind: parsed.kind,
      level: parsed.level,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      source: "llm",
    };

    // 4) Persiste en cache (best-effort, 24h)
    if (opts.cache) {
      try {
        await opts.cache.from("prompt_cache").insert({
          prompt_hash: cacheHash,
          model: NANO_MODEL,
          response: JSON.stringify(result),
          tokens_saved: 80,
          cost_saved_usd: 0.00002,
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        });
      } catch {
        /* ignore */
      }
    }

    return result;
  } catch {
    return regexClassify(message, fileCount);
  }
}
