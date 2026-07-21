/**
 * Chantier 2 — Cache prompt multi-provider (adaptateur).
 *
 * Objectif : faire baisser massivement le coût des tours répétés en s'appuyant
 * sur les mécanismes de cache prompt natifs de chaque provider. On NE code PAS
 * en dur un provider spécifique : l'utilisateur reste maître de son "Cerveau
 * d'Elena" et peut basculer OpenAI ↔ DeepSeek ↔ OpenRouter à tout moment.
 *
 * Toggle : `ELENA_CACHE_PROMPT=on` pour activer (défaut = off = comportement
 * strictement identique à avant, aucune régression possible).
 *
 * Mécanismes par provider :
 *  - **OpenAI** : `providerOptions.openai.promptCacheKey` route le prompt vers
 *    le même worker cache OpenAI (auto pour prompts ≥1024 tk, TTL 5-10 min).
 *  - **DeepSeek** : cache contextuel activé par défaut côté serveur, rien à
 *    envoyer — on se contente de logger les tokens cachés retournés.
 *  - **OpenRouter** : varie selon le modèle downstream. Les modèles Anthropic
 *    via OR exigent un `cache_control` posé sur les parts (nécessite de passer
 *    `system` en structure). Non activé dans cette phase — on observe les
 *    tokens cachés que le provider renvoie déjà (Claude sur Anthropic direct).
 *
 * Observabilité : `logCacheUsage()` extrait les compteurs `cachedInputTokens`
 * du usage AI-SDK et log un ratio, indépendamment du provider. C'est la seule
 * source de vérité pour valider le gain — quand `enabled=true` et
 * `hitPct > 0`, ça marche.
 */

import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { ModelMessage } from "ai";

export const CACHE_PROMPT_ENABLED =
  (process.env.ELENA_CACHE_PROMPT ?? "off").toLowerCase() === "on";

export type CacheProvider = "openai" | "deepseek" | "openrouter" | "anthropic";

/**
 * Construit le bloc `providerOptions` à passer à streamText/generateText.
 * Retourne `undefined` si le toggle est off OU si le provider n'a rien à
 * envoyer (cache automatique côté serveur).
 */
export function buildCacheProviderOptions(args: {
  provider: string;
  userId: string;
  projectId: string;
}): SharedV3ProviderOptions | undefined {
  if (!CACHE_PROMPT_ENABLED) return undefined;
  if (args.provider === "openai") {
    // Clé stable par (user, projet) : OpenAI route sur le même cache worker
    // et maximise le taux de hit dès le 2ᵉ tour. Bornée à 64 chars par sécurité.
    const key = `elena-${args.userId}-${args.projectId}`.slice(0, 64);
    return {
      openai: {
        promptCacheKey: key,
      },
    };
  }
  // DeepSeek : auto, aucun paramètre à envoyer.
  // Anthropic direct / OpenRouter+Claude : géré via buildCachedSystemMessage().
  return undefined;
}

/**
 * Phase 2.1 — Anthropic prompt caching (direct API ou via OpenRouter).
 *
 * Anthropic ne lit PAS un flag top-level : il faut poser un marqueur
 * `cache_control: {type:"ephemeral"}` sur les content parts qu'on veut
 * cacher (ici : le system prompt d'Elena, ~6-8k tokens stables).
 *
 * Retourne :
 *  - `null` → aucune restructuration (utiliser `system: string` normalement).
 *  - `{ systemMessages, skipSystem: true }` → prepender ces messages à
 *    `messages` et NE PAS passer `system:` à streamText.
 *
 * Compat AI-SDK : `providerOptions` posé sur une text-part est transmis
 * verbatim au provider (openai-compatible spread `providerOptions.openrouter`,
 * @ai-sdk/anthropic lit `providerOptions.anthropic.cacheControl`).
 */
export function buildCachedSystemMessage(args: {
  provider: string;
  model?: string;
  systemText: string;
}): { systemMessages: ModelMessage[]; skipSystem: true } | null {
  if (!CACHE_PROMPT_ENABLED) return null;
  if (!args.systemText || args.systemText.length < 200) return null;

  const isAnthropicDirect = args.provider === "anthropic";
  const isClaudeViaOR =
    args.provider === "openrouter" &&
    typeof args.model === "string" &&
    /anthropic\/|claude/i.test(args.model);

  if (!isAnthropicDirect && !isClaudeViaOR) return null;

  // Anthropic direct (@ai-sdk/anthropic) : lit providerOptions.anthropic.cacheControl
  // au niveau message et pose le cache_control sur la dernière part système.
  // OpenRouter+Claude via openai-compatible : le SDK ne transmet pas ce marqueur.
  // On expose quand même les deux clés — sur OpenRouter la clé est ignorée,
  // pas de régression. Pour Claude via OR, un adaptateur fetch dédié sera
  // nécessaire (phase 2.2), non couvert ici pour rester schema-valide.
  const systemMessages: ModelMessage[] = [
    {
      role: "system",
      content: args.systemText,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" as const } },
        openrouter: { cache_control: { type: "ephemeral" as const } },
      },
    } as unknown as ModelMessage,
  ];

  return { systemMessages, skipSystem: true };
}

/**
 * Extrait de façon défensive les compteurs de cache d'un `usage` AI-SDK.
 * Les noms varient selon le provider et la version du SDK ; on essaie tous
 * les alias connus (`cachedInputTokens`, `promptCachedTokens`,
 * `cache_read_input_tokens`, etc.).
 */
function pickNumber(o: unknown, keys: readonly string[]): number {
  if (!o || typeof o !== "object") return 0;
  const rec = o as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  }
  return 0;
}

export interface CacheLogContext {
  provider: string;
  model?: string;
  projectId: string;
  usage?: unknown;
  providerMetadata?: unknown;
}

export function logCacheUsage(route: string, ctx: CacheLogContext): void {
  const totalIn = pickNumber(ctx.usage, [
    "inputTokens",
    "promptTokens",
    "prompt_tokens",
  ]);
  const totalOut = pickNumber(ctx.usage, [
    "outputTokens",
    "completionTokens",
    "completion_tokens",
  ]);
  // Cache hit peut apparaître dans usage OU dans providerMetadata selon le SDK.
  const cachedIn =
    pickNumber(ctx.usage, [
      "cachedInputTokens",
      "cached_input_tokens",
      "promptCachedTokens",
      "prompt_cached_tokens",
    ]) ||
    pickNumber(ctx.providerMetadata, [
      "cachedInputTokens",
      "cached_tokens",
      "prompt_cache_hit_tokens",
      "cache_read_input_tokens",
    ]);

  const hitPct = totalIn > 0 ? Math.round((cachedIn / totalIn) * 100) : 0;
  const modelPart = ctx.model ? ` model=${ctx.model}` : "";
  console.log(
    `[cache] route=${route} enabled=${CACHE_PROMPT_ENABLED} provider=${ctx.provider}${modelPart} project=${ctx.projectId} inputTk=${totalIn} cachedTk=${cachedIn} outputTk=${totalOut} hitPct=${hitPct}%`,
  );
}
