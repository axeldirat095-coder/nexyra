/**
 * Elena — Classifieur 5 tiers (XS / S / M / L / XL).
 *
 * Objectif : router chaque message vers le modèle IA le moins cher qui reste
 * capable de traiter la demande. Chaque tier a un modèle "principal" et une
 * chaîne d'escalade automatique si l'appel échoue.
 *
 * Stratégie :
 *  1) Heuristiques rapides (longueur, mots-clés, code, fichiers joints) →
 *     décide dans ~90% des cas sans appel LLM.
 *  2) Zone grise → mini-appel gpt-5-nano (~50 tokens) pour trancher.
 *  3) L'utilisateur peut forcer un tier (debug) via `forcedTier`.
 *
 * Aucun changement DB : le mapping tier → provider/model est hardcodé ici
 * (source de vérité), les clés API viennent déjà de la table user existante.
 */
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { getUserKey, type SupportedProvider } from "./user-llm-resolver.server";
import { createOpenRouterCacheFetch } from "./openrouter-cache-fetch.server";
import { recordMetric } from "./elena-metrics.server";

// ---------------------------------------------------------------------------
// Types & mapping tier → modèle
// ---------------------------------------------------------------------------

export type Tier = "XS" | "S" | "M" | "L" | "XL";

type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue };
type JSONObject = { [k: string]: JSONValue };

export type TierSpec = {
  provider: SupportedProvider;
  model: string;
  /** Options provider-spécifiques (ex: extended thinking Anthropic via OpenRouter). */
  providerOptions?: JSONObject;
  /** Libellé business affiché dans l'UI. */
  label: string;
  /** Coût relatif indicatif (1 = XS baseline). */
  costMultiplier: number;
};

/**
 * Mapping tier → modèle. Modifier ce tableau = modifier le comportement.
 * Ordre validé par l'utilisateur (14/07/2026) :
 *  - XS/S : DeepSeek Chat (10× moins cher que GPT-5-nano, qualité OK sur trivial)
 *  - M    : GPT-5-mini (compromis qualité/prix pour chat standard)
 *  - L    : Claude Sonnet 4.5 via OpenRouter (roi du code)
 *  - XL   : Claude Sonnet 4.5 + Extended Thinking via OpenRouter (raisonnement lourd)
 */
export const TIER_MODELS: Record<Tier, TierSpec> = {
  XS: {
    provider: "deepseek",
    model: "deepseek-chat",
    label: "Ultra rapide",
    costMultiplier: 1,
  },
  S: {
    provider: "deepseek",
    model: "deepseek-chat",
    label: "Rapide",
    costMultiplier: 1,
  },
  M: {
    provider: "openai",
    model: "gpt-5-mini",
    label: "Standard",
    costMultiplier: 8,
  },
  L: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    label: "Puissant",
    costMultiplier: 30,
  },
  XL: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    providerOptions: {
      // Extended thinking Anthropic (OpenRouter passe le champ reasoning).
      reasoning: { effort: "high" },
    },
    label: "Maximum",
    costMultiplier: 60,
  },
};

/**
 * Chaîne d'auto-escalade en cas d'échec du modèle principal.
 * L'ordre : on essaie le tier supérieur (meilleur), puis on redescend.
 * Fallback final : `gpt-5-mini` OpenAI direct (indépendant d'OpenRouter/DeepSeek).
 */
const ESCALATION_CHAIN: Record<Tier, Tier[]> = {
  XS: ["S", "M"],
  S: ["M", "L"],
  M: ["L", "S"],
  L: ["XL", "M"],
  XL: ["L", "M"],
};

// ---------------------------------------------------------------------------
// Heuristiques de classification (pas d'appel LLM)
// ---------------------------------------------------------------------------

const CODE_KEYWORDS =
  /\b(refactor|refacto|component|composant|hook|route|migration|schema|api|endpoint|typescript|tailwind|supabase|edge function|createserverfn)\b/i;
const TRIVIAL_KEYWORDS =
  /\b(change|remplace|modifie|corrige|renomme|couleur|padding|margin|typo|texte|libell[ée]|traduis)\b/i;
// Mots-clés "raisonnement lourd" — déclenchent XL même sur message court car
// haute densité (architecture, microservices, stratégie…).
const REASONING_KEYWORDS =
  /\b(architecture|micro[- ]?services?|plateforme|infrastructure|scalabilit[ée]|planifie|planning|strat[ée]gie|roadmap|analyse|compare|explique pourquoi|d[ée]bat|arbitre|choisis entre|d[ée]cision|trade[- ]?off|arbitrage)\b/i;
// Mots-clés "demande de proposition/conception" — déclenchent au moins L.
const DESIGN_KEYWORDS =
  /\b(propose|con[çc]ois|design|mod[éè]lise|structure|organise|dimensionne|dimensionnement|e[- ]?commerce|marketplace|saas|backend|frontend|full[- ]?stack|paiements?|recommandations?)\b/i;
const CODE_BLOCK = /```[\s\S]+?```/;

export type ClassifyInput = {
  message: string;
  /** Nombre de fichiers joints (uploads, screenshots). */
  attachmentsCount?: number;
  /** L'utilisateur demande explicitement de la vision (image, screenshot) ? */
  hasVision?: boolean;
};

/**
 * Classification rapide sans LLM. Retourne un tier ou `null` si zone grise
 * (dans ce cas on appelle le mini-classifieur LLM).
 */
export function heuristicClassify(input: ClassifyInput): Tier | null {
  const msg = input.message.trim();
  const len = msg.length;

  // Vision → toujours au moins M (nécessite modèle multimodal capable)
  if (input.hasVision || (input.attachmentsCount ?? 0) > 0) {
    // Screenshot à analyser + demande complexe → L. Sinon M.
    if (len > 400 || REASONING_KEYWORDS.test(msg) || CODE_KEYWORDS.test(msg)) return "L";
    return "M";
  }

  // Raisonnement/architecture explicite → XL si long, L si court/moyen
  if (REASONING_KEYWORDS.test(msg)) {
    if (len > 200) return "XL";
    return "L";
  }

  // Demande de conception/proposition (e-commerce, SaaS, backend…) → L
  if (DESIGN_KEYWORDS.test(msg) && len > 60) return "L";

  // Bloc de code fourni ou demande code substantielle → L
  if (CODE_BLOCK.test(msg)) return "L";
  if (CODE_KEYWORDS.test(msg) && len > 300) return "L";

  // Retouche triviale explicite
  if (TRIVIAL_KEYWORDS.test(msg) && len < 200) return "XS";

  // Très court, pas de mot-clé → XS
  if (len < 80) return "XS";

  // Court → S
  if (len < 300) return "S";

  // Moyen sans signal fort → zone grise, laisser le LLM trancher
  if (len < 800) return null;

  // Long sans mot-clé code → M
  return "M";
}

/**
 * Appel gpt-5-nano ultra-court pour trancher la zone grise.
 * ~50 tokens en/sortie, coût négligeable (~0.00001$).
 */
async function llmClassify(message: string, openaiKey: string): Promise<Tier> {
  const openai = createOpenAI({ apiKey: openaiKey });
  const model = openai.chat("gpt-5-nano");
  const system =
    "Tu classifies une demande utilisateur en 1 tier: XS (trivial), S (court), M (standard), L (code/complexe), XL (raisonnement profond). Réponds UNIQUEMENT par une des 5 lettres, rien d'autre.";
  try {
    const { text } = await generateText({
      model,
      system,
      prompt: message.slice(0, 2000),
    });
    const t = text.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (t === "XS" || t === "S" || t === "M" || t === "L" || t === "XL") return t as Tier;
  } catch {
    /* fallback ci-dessous */
  }
  return "M"; // fallback safe
}

/**
 * Classification complète : heuristique → LLM si zone grise.
 * Si aucune clé OpenAI dispo pour le nano, on tombe sur M (safe default).
 */
export async function classifyTier(
  input: ClassifyInput,
  openaiKey: string | null,
): Promise<{ tier: Tier; source: "heuristic" | "llm" | "fallback" }> {
  const h = heuristicClassify(input);
  if (h) return { tier: h, source: "heuristic" };
  if (!openaiKey) return { tier: "M", source: "fallback" };
  const tier = await llmClassify(input.message, openaiKey);
  return { tier, source: "llm" };
}

// ---------------------------------------------------------------------------
// Construction du LanguageModel pour un tier
// ---------------------------------------------------------------------------

function buildTierModel(spec: TierSpec, apiKey: string): LanguageModel {
  if (spec.provider === "openai") {
    const c = createOpenAI({ apiKey });
    return c.chat(spec.model as Parameters<typeof c.chat>[0]);
  }
  if (spec.provider === "deepseek") {
    const c = createOpenAICompatible({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
      name: "deepseek",
    });
    return c.chatModel(spec.model);
  }
  if (spec.provider === "openrouter") {
    const c = createOpenAICompatible({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      name: "openrouter",
      headers: {
        "HTTP-Referer": "https://nexyra.app",
        "X-Title": "Nexyra Elena",
      },
      fetch: createOpenRouterCacheFetch(),
    });
    return c.chatModel(spec.model);
  }
  // anthropic direct — pas utilisé par les tiers actuels mais garde-fou type
  throw new Error(`Provider ${spec.provider} non géré par les tiers`);
}

// ---------------------------------------------------------------------------
// Runner tiered avec auto-escalade silencieuse
// ---------------------------------------------------------------------------

export type TieredRunResult = {
  text: string;
  tier: Tier;
  tierAttempted: Tier;
  provider: SupportedProvider;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  escaladed: boolean;
  attempts: Array<{ tier: Tier; error: string }>;
};

/**
 * Exécute un prompt sur un tier donné, avec bascule automatique sur les
 * tiers suivants de la chaîne d'escalade en cas d'échec (clé manquante,
 * quota, erreur réseau, timeout).
 */
export async function runTiered(args: {
  systemPrompt: string;
  userPrompt: string;
  tier: Tier;
  userId: string;
  abortSignal?: AbortSignal;
  /** Endpoint pour la métrique (ex: "chat", "workspace-quick"). */
  endpointLabel?: string;
}): Promise<TieredRunResult> {
  const chain: Tier[] = [args.tier, ...ESCALATION_CHAIN[args.tier]];
  const attempts: Array<{ tier: Tier; error: string }> = [];
  const t0 = Date.now();

  for (let i = 0; i < chain.length; i++) {
    const tier = chain[i];
    const spec = TIER_MODELS[tier];
    try {
      const apiKey = await getUserKey(args.userId, spec.provider);
      if (!apiKey) throw new Error(`Clé ${spec.provider} manquante`);
      const model = buildTierModel(spec, apiKey);
      const result = await generateText({
        model,
        system: args.systemPrompt,
        prompt: args.userPrompt,
        abortSignal: args.abortSignal,
        ...(spec.providerOptions
          ? { providerOptions: { [spec.provider]: spec.providerOptions } }
          : {}),
      });
      const tokensInput = result.usage?.inputTokens ?? 0;
      const tokensOutput = result.usage?.outputTokens ?? 0;
      void recordMetric({
        userId: args.userId,
        endpoint: args.endpointLabel ?? `tier-${tier}`,
        taskType: `tier_${tier}`,
        model: `${spec.provider}/${spec.model}`,
        tokensInput,
        tokensOutput,
        latencyMs: Date.now() - t0,
        success: true,
      });
      return {
        text: result.text ?? "",
        tier,
        tierAttempted: args.tier,
        provider: spec.provider,
        model: spec.model,
        tokensInput,
        tokensOutput,
        escaladed: i > 0,
        attempts,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ tier, error: msg });
      // Si l'utilisateur a annulé, on ne continue pas la chaîne.
      if (msg.toLowerCase().includes("abort")) throw e;
    }
  }

  // Toute la chaîne a échoué
  void recordMetric({
    userId: args.userId,
    endpoint: args.endpointLabel ?? `tier-${args.tier}`,
    taskType: `tier_${args.tier}`,
    latencyMs: Date.now() - t0,
    success: false,
    errorMessage: `Chaîne d'escalade épuisée: ${attempts.map((a) => `${a.tier}:${a.error}`).join(" | ")}`,
  });
  throw new Error(
    `Tous les tiers de la chaîne ont échoué (${chain.join(" → ")}). Vérifie tes clés API (OpenAI, DeepSeek, OpenRouter) dans Réglages.`,
  );
}
