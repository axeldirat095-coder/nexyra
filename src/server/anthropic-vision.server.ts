/**
 * Anthropic Claude vision helper — reverse-engineering visuel d'Elena.
 *
 * Optimisations clés :
 * - **Cache par image** : on hash les image_urls et on stocke le contrat dans
 *   `llm_cache`. Si l'utilisateur itère sur le MÊME visuel (clic après clic
 *   pour corriger Elena), on ne rappelle PAS Claude → coût ~0 €.
 * - **Prompt enrichi** : insiste sur les voiles lumineux, glows, gradients
 *   atmosphériques qui relient les éléments (souvent ratés à la 1ʳᵉ passe).
 *
 * BYOK : la clé est lue dans `api_keys` via la RPC `get_api_key_decrypted`.
 */
import { createHash } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel } from "ai";
import { createClient } from "@supabase/supabase-js";
import { fetchImagesAsBuffers } from "./image-fetch.server";

const CLAUDE_VISION_MODEL = "claude-sonnet-4-5";
const CACHE_TASK_TYPE = "claude-vision-reverse-engineer";
const CACHE_PROMPT_VERSION = "v2-request-aware-glows-content-hash";

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getUserAnthropicKey(userId: string): Promise<string | null> {
  try {
    const sb = adminClient();
    const { data } = await sb.rpc(
      "get_api_key_decrypted" as never,
      {
        _owner_id: userId,
        _provider: "anthropic",
      } as never,
    );
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

async function imageFingerprint(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return `bytes:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return `url:${url.trim()}`;
  }
}

async function hashImages(imageUrls: string[]): Promise<string> {
  const fingerprints = await Promise.all(imageUrls.map(imageFingerprint));
  const normalized = fingerprints.sort().join("\n");
  return createHash("sha256")
    .update(`${CACHE_TASK_TYPE}\n${CACHE_PROMPT_VERSION}\n${normalized}`)
    .digest("hex");
}

function userPriorityBlock(userRequest: string): string {
  return `## DEMANDE UTILISATEUR — PRIORITÉ ABSOLUE\n${userRequest.trim()}\n\nRègle d'exécution pour Elena : cette demande passe AVANT toute interprétation créative. Si l'utilisateur demande de supprimer, modifier, déplacer ou reproduire à l'identique, tu dois appliquer exactement cette correction dans le code final.`;
}

function withUserPriority(contract: string, userRequest: string): string {
  return `${userPriorityBlock(userRequest)}\n\n---\n\n${contract}\n\n---\n\n## CONTRÔLE FINAL OBLIGATOIRE\nAvant de répondre, compare le rendu au visuel original : aucun élément demandé supprimé ne doit rester, aucun voile lumineux/glow visible ne doit manquer, et les proportions doivent rester proches de la référence.`;
}

const REVERSE_ENGINEER_PROMPT = `Tu es un expert reverse-engineering UI. Analyse ces images pour qu'Elena recrée la page À L'IDENTIQUE, pas seulement "dans l'esprit".

Si plusieurs images sont fournies, commence par les classer :
- image originale/référence,
- rendu actuel à corriger,
- capture annotée avec éléments à supprimer/modifier.
Les annotations, flèches, cadres, zones entourées, textes de correction et consignes utilisateur sont PRIORITAIRES. Tu dois produire une liste explicite "À SUPPRIMER" et "À MODIFIER" quand c'est visible ou demandé.

Retourne un CONTRAT DE RECONSTRUCTION en français, ULTRA précis et exploitable en React/Tailwind :

1. **Layout global** : grille (ex 12 cols), colonnes, alignements, ordre vertical, proportions en %.
2. **Header/nav** : logo, liens, boutons, hauteurs (px), positions exactes.
3. **Hero** : placement gauche/centre/droite, taille du H1 (rem), sous-titre, CTA (couleurs, padding, radius).
4. **Sections/cards visibles** : nombre exact, largeur relative en %, icônes/emojis, textes lisibles, décorations.
5. **Palette** : hex précis (sample les pixels), gradients (angle + stops exacts), ombres, bordures.
6. **Typo** : famille suggérée, tailles relatives, weights (400/500/600/700), hiérarchie.
7. **Images/médias** : description précise pour les recréer ou choisir une URL Unsplash adéquate.

8. **🔥 EFFETS LUMINEUX & ATMOSPHÈRE — CRITIQUE, NE JAMAIS OUBLIER :**
   - Voiles lumineux / halos / glows qui relient les zones (ex : voile lumineux partant d'un produit jusqu'à une carte stats à droite).
   - Pour CHAQUE glow visible : décris d'où il PART, où il VA, sa couleur (hex), son opacité, son blur (px), et la forme (ellipse, traînée, dégradé radial).
   - Lignes lumineuses / wave-glows / séparateurs SVG néon (avec couleur + glow + position exacte).
   - Particules, étoiles d'arrière-plan, dégradés radiaux d'ambiance.
   - Reflets sur produits, bordures lumineuses, neon outlines.
   - Si un glow traverse plusieurs sections, dis-le explicitement : "halo radial bleu→violet partant du sweat (gauche) traversant tout le hero jusqu'à la carte stats (droite), opacity 0.4, blur 80px".

9. **Checklist exhaustive** : liste TOUS les éléments visibles, en particulier les effets lumineux subtils — c'est ce qui fait la différence entre "approximatif" et "identique".

Utilise des valeurs CSS approximatives (px, %, rem, gap-N Tailwind). Sois CHIRURGICAL, pas vague. Les voiles lumineux sont SOUVENT oubliés à la 1ʳᵉ passe — fais-en une priorité.`;

const REFERENCE_CODE_QA_PROMPT = `Tu es le contrôleur qualité visuel d'Elena. Tu compares une référence UI avec le code React/Tailwind écrit.

Objectif : dire si le code peut raisonnablement produire la MÊME structure visuelle que la référence, ou s'il s'agit seulement d'une inspiration.

Règles :
- Sois sévère : si une zone majeure manque, verdict REFAIRE.
- Les effets lumineux/glows/voiles/halos comptent comme des éléments majeurs.
- Les consignes utilisateur supprimer/modifier/déplacer passent avant tout.
- Ne propose que des fixes directement actionnables dans App.tsx / index.css.

Format obligatoire :
## Verdict
OK ou FIX ou REFAIRE

## Écarts bloquants
- ...

## Corrections à appliquer maintenant
1. ...
2. ...
3. ...`;

const REFERENCE_RENDER_QA_PROMPT = `Tu es le contrôleur qualité visuel final d'Elena. Tu compares des images de référence UI avec une capture réelle du rendu généré.

Ordre des images : d'abord les références utilisateur, puis EN DERNIER la capture réelle actuelle d'Elena.

Objectif : décider si le rendu actuel ressemble vraiment à la référence, pas seulement au même thème.

Règles sévères :
- Si la structure globale, les proportions hero/cards/nav ou la composition diffèrent fortement : REFAIRE.
- Si les effets lumineux majeurs, voiles, glows, lignes néon ou halos visibles dans la référence manquent : FIX ou REFAIRE.
- Si Elena a seulement changé des détails mineurs alors que le rendu reste éloigné : REFAIRE.
- Les consignes utilisateur supprimer/modifier/déplacer passent avant tout.
- Ne juge PAS le code : juge uniquement ce que tu vois dans la capture finale.

Format obligatoire :
## Verdict
OK ou FIX ou REFAIRE

## Écarts visibles majeurs
- ...

## Corrections à appliquer maintenant
1. ...
2. ...
3. ...`;

export async function reverseEngineerWithClaude(args: {
  apiKey: string;
  imageUrls: string[];
  userRequest: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; model: string; cached: boolean }> {
  const cacheKey = await hashImages(args.imageUrls);
  const sb = adminClient();

  // 1) Cache lookup (par image, indépendant du user_request)
  try {
    const { data: hit } = await sb
      .from("llm_cache")
      .select("response_text, hits")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (hit?.response_text) {
      void sb
        .from("llm_cache")
        .update({ hits: (hit.hits ?? 1) + 1, last_used_at: new Date().toISOString() })
        .eq("cache_key", cacheKey);
      return {
        text: withUserPriority(hit.response_text, args.userRequest),
        model: `anthropic/${CLAUDE_VISION_MODEL} (cached)`,
        cached: true,
      };
    }
  } catch (e) {
    console.warn("[claude-vision] cache lookup failed:", e);
  }

  // 2) Miss → appel Claude (on télécharge les images en bytes pour éviter
  // les "Failed to download" sur les URLs sans extension type chat-uploads).
  const fetched = await fetchImagesAsBuffers(args.imageUrls);
  const anthropic = createAnthropic({ apiKey: args.apiKey });
  const r = await generateText({
    model: anthropic(CLAUDE_VISION_MODEL),
    abortSignal: args.abortSignal,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${userPriorityBlock(args.userRequest)}\n\n${REVERSE_ENGINEER_PROMPT}`,
          },
          ...fetched.map((f) => ({
            type: "image" as const,
            image: f.data,
            mediaType: f.mediaType,
          })),
        ],
      },
    ],
  });

  // 3) Store
  try {
    await sb.from("llm_cache").insert({
      cache_key: cacheKey,
      task_type: CACHE_TASK_TYPE,
      model: `anthropic/${CLAUDE_VISION_MODEL}`,
      response_text: r.text,
      prompt_text: args.imageUrls.join("\n").slice(0, 8000),
      tokens_input: r.usage?.inputTokens ?? 0,
      tokens_output: r.usage?.outputTokens ?? 0,
    });
  } catch (e) {
    console.warn("[claude-vision] cache insert failed:", e);
  }

  return {
    text: withUserPriority(r.text, args.userRequest),
    model: `anthropic/${CLAUDE_VISION_MODEL}`,
    cached: false,
  };
}

export async function qaReferenceCodeWithClaude(args: {
  apiKey: string;
  imageUrls: string[];
  userRequest: string;
  contract: string;
  codeContext: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; verdict: "OK" | "FIX" | "REFAIRE"; model: string }> {
  const fetched = await fetchImagesAsBuffers(args.imageUrls);
  const anthropic = createAnthropic({ apiKey: args.apiKey });
  const r = await generateText({
    model: anthropic(CLAUDE_VISION_MODEL),
    abortSignal: args.abortSignal,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${userPriorityBlock(args.userRequest)}\n\n${REFERENCE_CODE_QA_PROMPT}\n\n## Contrat de reconstruction\n${args.contract.slice(0, 12000)}\n\n## Code écrit par Elena\n${args.codeContext.slice(0, 30000)}`,
          },
          ...fetched.map((f) => ({
            type: "image" as const,
            image: f.data,
            mediaType: f.mediaType,
          })),
        ],
      },
    ],
  });
  const verdictMatch = r.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX|REFAIRE)`?/i);
  const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as "OK" | "FIX" | "REFAIRE";
  return { text: r.text, verdict, model: `anthropic/${CLAUDE_VISION_MODEL}` };
}

export async function qaReferenceRenderWithClaude(args: {
  apiKey: string;
  referenceImageUrls: string[];
  renderedImageBase64: string;
  userRequest: string;
  contract: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; verdict: "OK" | "FIX" | "REFAIRE"; model: string }> {
  const fetched = await fetchImagesAsBuffers(args.referenceImageUrls);
  const anthropic = createAnthropic({ apiKey: args.apiKey });
  const r = await generateText({
    model: anthropic(CLAUDE_VISION_MODEL),
    abortSignal: args.abortSignal,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${userPriorityBlock(args.userRequest)}\n\n${REFERENCE_RENDER_QA_PROMPT}\n\n## Contrat de reconstruction\n${args.contract.slice(0, 12000)}`,
          },
          ...fetched.map((f) => ({
            type: "image" as const,
            image: f.data,
            mediaType: f.mediaType,
          })),
          { type: "image" as const, image: args.renderedImageBase64 },
        ],
      },
    ],
  });
  const verdictMatch = r.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX|REFAIRE)`?/i);
  const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as "OK" | "FIX" | "REFAIRE";
  return { text: r.text, verdict, model: `anthropic/${CLAUDE_VISION_MODEL}` };
}

// ---------------------------------------------------------------------------
// API générique — accepte n'importe quel LanguageModel ai-sdk (Cerveau d'Elena).
// Utilisée par les outils vision pour respecter le provider/model choisi
// par l'utilisateur dans Réglages → Cerveau d'Elena → Vision.
// ---------------------------------------------------------------------------

/**
 * reverse_engineer générique. Si `modelLabel` commence par `anthropic/` ou
 * contient "claude", on bénéficie du cache `llm_cache` (clé = images +
 * modelLabel). Sinon on appelle sans cache (rare : peu d'itérations).
 */
export async function reverseEngineerWithModel(args: {
  model: LanguageModel;
  modelLabel: string;
  imageUrls: string[];
  userRequest: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; model: string; cached: boolean }> {
  const sb = adminClient();
  const cacheKey = createHash("sha256")
    .update(
      `${CACHE_TASK_TYPE}\n${CACHE_PROMPT_VERSION}\n${args.modelLabel}\n${(
        await Promise.all(args.imageUrls.map(imageFingerprint))
      )
        .sort()
        .join("\n")}`,
    )
    .digest("hex");

  // 1) Cache lookup
  try {
    const { data: hit } = await sb
      .from("llm_cache")
      .select("response_text, hits")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (hit?.response_text) {
      void sb
        .from("llm_cache")
        .update({ hits: (hit.hits ?? 1) + 1, last_used_at: new Date().toISOString() })
        .eq("cache_key", cacheKey);
      return {
        text: withUserPriority(hit.response_text, args.userRequest),
        model: `${args.modelLabel} (cached)`,
        cached: true,
      };
    }
  } catch (e) {
    console.warn("[vision-generic] cache lookup failed:", e);
  }

  // 2) Miss → appel modèle
  const fetched = await fetchImagesAsBuffers(args.imageUrls);
  const r = await generateText({
    model: args.model,
    abortSignal: args.abortSignal,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${userPriorityBlock(args.userRequest)}\n\n${REVERSE_ENGINEER_PROMPT}`,
          },
          ...fetched.map((f) => ({
            type: "image" as const,
            image: f.data,
            mediaType: f.mediaType,
          })),
        ],
      },
    ],
  });

  // 3) Store
  try {
    await sb.from("llm_cache").insert({
      cache_key: cacheKey,
      task_type: CACHE_TASK_TYPE,
      model: args.modelLabel,
      response_text: r.text,
      prompt_text: args.imageUrls.join("\n").slice(0, 8000),
      tokens_input: r.usage?.inputTokens ?? 0,
      tokens_output: r.usage?.outputTokens ?? 0,
    });
  } catch (e) {
    console.warn("[vision-generic] cache insert failed:", e);
  }

  return {
    text: withUserPriority(r.text, args.userRequest),
    model: args.modelLabel,
    cached: false,
  };
}

export async function qaReferenceCodeWithModel(args: {
  model: LanguageModel;
  modelLabel: string;
  imageUrls: string[];
  userRequest: string;
  contract: string;
  codeContext: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; verdict: "OK" | "FIX" | "REFAIRE"; model: string }> {
  const fetched = await fetchImagesAsBuffers(args.imageUrls);
  const r = await generateText({
    model: args.model,
    abortSignal: args.abortSignal,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${userPriorityBlock(args.userRequest)}\n\n${REFERENCE_CODE_QA_PROMPT}\n\n## Contrat de reconstruction\n${args.contract.slice(0, 12000)}\n\n## Code écrit par Elena\n${args.codeContext.slice(0, 30000)}`,
          },
          ...fetched.map((f) => ({
            type: "image" as const,
            image: f.data,
            mediaType: f.mediaType,
          })),
        ],
      },
    ],
  });
  const verdictMatch = r.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX|REFAIRE)`?/i);
  const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as "OK" | "FIX" | "REFAIRE";
  return { text: r.text, verdict, model: args.modelLabel };
}

export async function qaReferenceRenderWithModel(args: {
  model: LanguageModel;
  modelLabel: string;
  referenceImageUrls: string[];
  renderedImageBase64: string;
  userRequest: string;
  contract: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; verdict: "OK" | "FIX" | "REFAIRE"; model: string }> {
  const fetched = await fetchImagesAsBuffers(args.referenceImageUrls);
  const r = await generateText({
    model: args.model,
    abortSignal: args.abortSignal,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${userPriorityBlock(args.userRequest)}\n\n${REFERENCE_RENDER_QA_PROMPT}\n\n## Contrat de reconstruction\n${args.contract.slice(0, 12000)}`,
          },
          ...fetched.map((f) => ({
            type: "image" as const,
            image: f.data,
            mediaType: f.mediaType,
          })),
          { type: "image" as const, image: args.renderedImageBase64 },
        ],
      },
    ],
  });
  const verdictMatch = r.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX|REFAIRE)`?/i);
  const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as "OK" | "FIX" | "REFAIRE";
  return { text: r.text, verdict, model: args.modelLabel };
}
