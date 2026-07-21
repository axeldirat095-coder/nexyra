/**
 * Image generation/edition pour le **chat libre** Elena.
 *
 * Différence majeure avec `agent-tools.server.ts` :
 * - On NE TOUCHE PAS au sandbox / vfs / mutations.
 * - L'image générée est uploadée dans le bucket Supabase Storage `chat-images`
 *   (public read) et on retourne une URL stable utilisable directement dans
 *   un `<img src=...>` ou un markdown `![](url)`.
 *
 * Cascade BYOK :
 *   1. OpenAI gpt-image-1     (clé user — qualité photo+typo)
 *   2. Lovable AI Gateway     (gemini-2.5-flash-image — fallback gratuit)
 *
 * Pas de fallback fal.ai ici (l'écosystème chat reste léger ; fal.ai est
 * réservé au mode dev où on a déjà 4 fournisseurs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ImageTier = "XS" | "S" | "M" | "L" | "XL";

export interface GenerateInlineImageOpts {
  prompt: string;
  /** Optionnel : aspect-ratio ; défaut 1:1. */
  aspect?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  openaiKey: string | null;
  lovableKey?: string | null;
  /** Forcer un provider spécifique. "auto" = cascade BYOK habituelle. */
  provider?: "auto" | "openai" | "recraft" | "lovable";
  /** Style Recraft (ex: "realistic_image", "digital_illustration", "vector_illustration"). */
  recraftStyle?: string;
  /**
   * Tier d'intelligence pour la génération (Cerveau d'Elena) :
   *  - XS : Gemini 2.5 Flash Image (Nano Banana) via Lovable Gateway — ~0.03$
   *  - S  : Gemini 3.1 Flash Image (Nano Banana 2) via Lovable Gateway — ~0.04$
   *  - M  : OpenAI gpt-image-1 quality: low — ~0.05$
   *  - L  : OpenAI gpt-image-1 quality: medium — ~0.17$
   *  - XL : OpenAI gpt-image-1 quality: high — ~0.19$
   * Ignoré si `provider` est explicitement forcé (openai/recraft/lovable).
   */
  tier?: ImageTier;
  /** Client admin pour uploader (bypass RLS). */
  storage: SupabaseClient;
  /** ID du user (pour ranger le fichier dans son dossier). */
  userId: string;
}


export interface EditInlineImageOpts {
  prompt: string;
  /** URL publique de l'image source (chat-uploads ou chat-images). */
  sourceUrl: string;
  openaiKey: string | null;
  storage: SupabaseClient;
  userId: string;
}

export interface InlineImageResult {
  /** URL publique stable (Supabase Storage). */
  url: string;
  /** Modèle utilisé. */
  model: string;
}

export interface InlineImageError {
  error: string;
  /** Détail des providers tentés (debug). */
  failures: string[];
}

const BUCKET = "chat-images";

function aspectToOpenAISize(aspect: GenerateInlineImageOpts["aspect"]): string {
  if (aspect === "9:16" || aspect === "3:4") return "1024x1536";
  if (aspect === "16:9" || aspect === "4:3") return "1536x1024";
  return "1024x1024";
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("dataUrl invalide");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function uploadAndGetUrl(
  storage: SupabaseClient,
  userId: string,
  source: string | Uint8Array,
  mime = "image/png",
): Promise<string> {
  let bytes: Uint8Array;
  let finalMime = mime;
  if (typeof source === "string") {
    if (source.startsWith("data:")) {
      const decoded = dataUrlToBytes(source);
      bytes = decoded.bytes;
      finalMime = decoded.mime;
    } else {
      // URL distante (fal.ai, Lovable AI peut renvoyer une URL)
      const r = await fetch(source);
      if (!r.ok) throw new Error(`download ${r.status}`);
      const buf = await r.arrayBuffer();
      bytes = new Uint8Array(buf);
      finalMime = r.headers.get("content-type") ?? mime;
    }
  } else {
    bytes = source;
  }
  const ext = finalMime.includes("jpeg") || finalMime.includes("jpg")
    ? "jpg"
    : finalMime.includes("webp")
      ? "webp"
      : "png";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await storage.storage.from(BUCKET).upload(path, bytes, {
    contentType: finalMime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`storage upload: ${error.message}`);
  const { data } = storage.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* -------------------------------------------------------------------------- */
/* GENERATE                                                                   */
/* -------------------------------------------------------------------------- */

function aspectToRecraftSize(aspect: GenerateInlineImageOpts["aspect"]): string {
  if (aspect === "9:16") return "portrait_16_9";
  if (aspect === "16:9") return "landscape_16_9";
  if (aspect === "3:4") return "portrait_4_3";
  if (aspect === "4:3") return "landscape_4_3";
  return "square_hd";
}

async function tryRecraftV3(
  opts: GenerateInlineImageOpts,
  failures: string[],
): Promise<InlineImageResult | null> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    failures.push("recraft-v3: FAL_KEY absente côté serveur");
    return null;
  }
  try {
    const submit = await fetch("https://queue.fal.run/fal-ai/recraft-v3", {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: opts.prompt,
        image_size: aspectToRecraftSize(opts.aspect ?? "1:1"),
        style: opts.recraftStyle ?? "realistic_image",
      }),
    });
    if (!submit.ok) {
      const t = await submit.text().catch(() => "");
      failures.push(`recraft-v3 submit ${submit.status}: ${t.slice(0, 200)}`);
      return null;
    }
    const sub = (await submit.json()) as { status_url: string; response_url: string };
    // Poll
    const start = Date.now();
    while (Date.now() - start < 90_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(sub.status_url, { headers: { Authorization: `Key ${falKey}` } });
      if (!s.ok) continue;
      const sj = (await s.json()) as { status?: string };
      if (sj.status === "COMPLETED") {
        const rr = await fetch(sub.response_url, { headers: { Authorization: `Key ${falKey}` } });
        const rj = (await rr.json()) as { images?: Array<{ url?: string }> };
        const imgUrl = rj.images?.[0]?.url;
        if (!imgUrl) {
          failures.push("recraft-v3: pas d'image renvoyée");
          return null;
        }
        const url = await uploadAndGetUrl(opts.storage, opts.userId, imgUrl);
        return { url, model: "fal-ai/recraft-v3" };
      }
      if (sj.status === "FAILED") {
        failures.push("recraft-v3: job FAILED");
        return null;
      }
    }
    failures.push("recraft-v3: timeout (>90s)");
    return null;
  } catch (e) {
    failures.push(`recraft-v3 net: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Appel OpenAI gpt-image-1 avec quality paramétrable (low / medium / high).
 * Utilisé à la fois par la cascade legacy et par les tiers M/L/XL.
 */
async function tryOpenAIImage(
  opts: GenerateInlineImageOpts,
  quality: "low" | "medium" | "high",
  failures: string[],
): Promise<InlineImageResult | null> {
  if (!opts.openaiKey) {
    failures.push("openai: clé user absente");
    return null;
  }
  try {
    const size = aspectToOpenAISize(opts.aspect ?? "1:1");
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: opts.prompt,
        n: 1,
        size,
        quality,
      }),
    });
    if (r.ok) {
      const j = (await r.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = j.data?.[0]?.b64_json;
      if (b64) {
        const url = await uploadAndGetUrl(
          opts.storage,
          opts.userId,
          `data:image/png;base64,${b64}`,
        );
        return { url, model: `openai/gpt-image-1 (${quality})` };
      }
      failures.push(`openai/gpt-image-1 ${quality}: réponse vide`);
    } else {
      const t = await r.text().catch(() => "");
      failures.push(`openai/gpt-image-1 ${quality} HTTP ${r.status}: ${t.slice(0, 160)}`);
    }
  } catch (e) {
    failures.push(`openai/gpt-image-1 ${quality} net: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

/**
 * Appel Gemini image (Nano Banana / Nano Banana 2) via Lovable AI Gateway.
 * Utilisé pour les tiers XS et S (économie ~5× vs OpenAI).
 */
async function tryGeminiImage(
  opts: GenerateInlineImageOpts,
  model: "google/gemini-2.5-flash-image" | "google/gemini-3.1-flash-image",
  failures: string[],
): Promise<InlineImageResult | null> {
  const lov = opts.lovableKey ?? process.env.LOVABLE_API_KEY ?? null;
  if (!lov) {
    failures.push(`${model}: LOVABLE_API_KEY absente`);
    return null;
  }
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lov}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `${opts.prompt} (aspect ratio: ${opts.aspect ?? "1:1"})`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });
    if (r.ok) {
      const j = (await r.json()) as {
        choices?: Array<{
          message?: { images?: Array<{ image_url?: { url?: string } }> };
        }>;
      };
      const imgUrl = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (imgUrl) {
        const url = await uploadAndGetUrl(opts.storage, opts.userId, imgUrl);
        return { url, model: `lovable/${model}` };
      }
      failures.push(`${model}: réponse sans image`);
    } else {
      const t = await r.text().catch(() => "");
      failures.push(`${model} HTTP ${r.status}: ${t.slice(0, 160)}`);
    }
  } catch (e) {
    failures.push(`${model} net: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

export async function generateInlineImage(
  opts: GenerateInlineImageOpts,
): Promise<InlineImageResult | InlineImageError> {
  const failures: string[] = [];
  const provider = opts.provider ?? "auto";

  // Si provider=recraft → exclusif (pour comparaison directe)
  if (provider === "recraft") {
    const r = await tryRecraftV3(opts, failures);
    if (r) return r;
    return {
      error:
        "Recraft v3 indisponible. Vérifie que FAL_KEY est configurée côté serveur.",
      failures,
    };
  }

  // ============ Tiers d'intelligence pour la génération image ============
  // Cascade tier → fallback tier inférieur → fallback tier supérieur.
  if (opts.tier && provider === "auto") {
    const tierOrder: ImageTier[] = ["XS", "S", "M", "L", "XL"];
    const startIdx = tierOrder.indexOf(opts.tier);
    // On essaie le tier demandé, puis on redescend (moins cher), puis on remonte (plus cher).
    const chain = [
      opts.tier,
      ...tierOrder.slice(0, startIdx).reverse(), // moins cher d'abord
      ...tierOrder.slice(startIdx + 1),          // plus cher en dernier
    ];
    for (const t of chain) {
      let r: InlineImageResult | null = null;
      if (t === "XS") r = await tryGeminiImage(opts, "google/gemini-2.5-flash-image", failures);
      else if (t === "S") r = await tryGeminiImage(opts, "google/gemini-3.1-flash-image", failures);
      else if (t === "M") r = await tryOpenAIImage(opts, "low", failures);
      else if (t === "L") r = await tryOpenAIImage(opts, "medium", failures);
      else if (t === "XL") r = await tryOpenAIImage(opts, "high", failures);
      if (r) return { url: r.url, model: `${r.model} [tier:${t}]` };
    }
    return {
      error:
        "Aucun générateur d'image disponible pour ce tier. Vérifie tes clés (OpenAI pour M/L/XL, Lovable AI Gateway actif pour XS/S).",
      failures,
    };
  }

  // ============ Cascade legacy (sans tier) ============
  // 1) OpenAI gpt-image-1 (BYOK) — sauf si provider=lovable
  if (provider !== "lovable") {
    const r = await tryOpenAIImage(opts, "medium", failures);
    if (r) return r;
  }

  // 2) Recraft v3 via fal.ai (fallback en mode auto)
  if (provider === "auto") {
    const r = await tryRecraftV3(opts, failures);
    if (r) return r;
  }

  // 3) Lovable AI Gateway (gemini image)
  const lov = opts.lovableKey ?? process.env.LOVABLE_API_KEY ?? null;
  if (lov) {
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lov}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: `${opts.prompt} (aspect ratio: ${opts.aspect ?? "1:1"})`,
            },
          ],
          modalities: ["image", "text"],
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as {
          choices?: Array<{
            message?: { images?: Array<{ image_url?: { url?: string } }> };
          }>;
        };
        const imgUrl = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imgUrl) {
          const url = await uploadAndGetUrl(opts.storage, opts.userId, imgUrl);
          return { url, model: "lovable/gemini-2.5-flash-image" };
        }
        failures.push("lovable: réponse sans image");
      } else {
        const t = await r.text().catch(() => "");
        failures.push(`lovable HTTP ${r.status}: ${t.slice(0, 160)}`);
      }
    } catch (e) {
      failures.push(`lovable net: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    failures.push("lovable: LOVABLE_API_KEY absente");
  }

  return {
    error:
      "Aucun générateur d'image disponible. Ajoute une clé OpenAI dans Réglages → Intégrations & API pour activer la génération d'images premium (gpt-image-1).",
    failures,
  };
}

/* -------------------------------------------------------------------------- */
/* EDIT                                                                       */
/* -------------------------------------------------------------------------- */

export async function editInlineImage(
  opts: EditInlineImageOpts,
): Promise<InlineImageResult | InlineImageError> {
  const failures: string[] = [];

  if (!opts.openaiKey) {
    return {
      error:
        "L'édition d'image nécessite une clé OpenAI (gpt-image-1). Ajoute-la dans Réglages → Intégrations & API.",
      failures: ["openai: clé user absente"],
    };
  }

  try {
    // 1) Récup l'image source
    const srcRes = await fetch(opts.sourceUrl);
    if (!srcRes.ok) {
      failures.push(`source download ${srcRes.status}`);
      return { error: "Impossible de télécharger l'image source.", failures };
    }
    const srcBlob = await srcRes.blob();
    const srcMime = srcBlob.type || "image/png";

    // 2) gpt-image-1 edits — multipart form
    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("prompt", opts.prompt);
    fd.append("n", "1");
    fd.append("size", "1024x1024");
    fd.append("image", srcBlob, `source.${srcMime.split("/")[1] ?? "png"}`);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.openaiKey}` },
      body: fd,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      failures.push(`openai/gpt-image-1 edits HTTP ${r.status}: ${t.slice(0, 200)}`);
      return { error: "Édition d'image refusée par OpenAI.", failures };
    }
    const j = (await r.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) {
      failures.push("openai/gpt-image-1 edits: réponse vide");
      return { error: "OpenAI n'a pas renvoyé d'image.", failures };
    }
    const url = await uploadAndGetUrl(
      opts.storage,
      opts.userId,
      `data:image/png;base64,${b64}`,
    );
    return { url, model: "openai/gpt-image-1 (edit)" };
  } catch (e) {
    failures.push(`edit net: ${e instanceof Error ? e.message : String(e)}`);
    return { error: "Erreur réseau pendant l'édition.", failures };
  }
}
