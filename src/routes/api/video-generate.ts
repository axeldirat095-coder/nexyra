/**
 * Génération vidéo via fal.ai (text-to-video & image-to-video).
 *
 * Modèles supportés (slug fal officiel) :
 *  - "fal-ai/veo3"                              → Veo 3 (Google, top qualité)
 *  - "fal-ai/kling-video/v2/master/text-to-video" → Kling v2 (cinématique, rapide)
 *  - "fal-ai/luma-dream-machine"                → Luma Dream Machine
 *  - "fal-ai/kling-video/v2/master/image-to-video" → Kling i2v (anim image)
 *
 * Auth : `FAL_KEY` server-side (déjà provisionné Lovable Cloud).
 *
 * Réponse POST : { ok, status:"processing", request_id, model } | { ok:false, error }
 * Réponse GET  : { ok, status:"completed", video_url } ou { ok, status:"processing" }
 *
 * Note : on ne poll plus longtemps ici : ça évite les timeouts et les relances payantes.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { checkFalVideo, generateFalVideo } from "@/server/video-generation.server";

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  model: z
    .enum([
      "fal-ai/veo3",
      "fal-ai/kling-video/v2/master/text-to-video",
      "fal-ai/kling-video/v2/master/image-to-video",
      "fal-ai/luma-dream-machine",
    ])
    .default("fal-ai/kling-video/v2/master/text-to-video"),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  duration_s: z.union([z.literal(5), z.literal(8), z.literal(10)]).default(5),
  /** URL d'image source pour image-to-video. */
  image_url: z.string().url().optional(),
});

const checkSchema = z.object({
  request_id: z.string().min(1),
  model: z
    .enum([
      "fal-ai/veo3",
      "fal-ai/kling-video/v2/master/text-to-video",
      "fal-ai/kling-video/v2/master/image-to-video",
      "fal-ai/luma-dream-machine",
    ])
    .optional(),
  status_url: z.string().url().optional(),
  response_url: z.string().url().optional(),
});

export const Route = createFileRoute("/api/video-generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
        const anon =
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY;
        if (!url || !anon) return new Response("Server misconfig", { status: 500 });

        const sbUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: claims, error } = await sbUser.auth.getClaims(token);
        if (error || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch (e) {
          return new Response(`Bad request: ${e instanceof Error ? e.message : "invalid"}`, { status: 400 });
        }

        const apiKey = process.env.FAL_KEY;
        if (!apiKey) {
          return Response.json({ ok: false, error: "FAL_KEY non configurée côté serveur." }, { status: 500 });
        }

        const result = await generateFalVideo(body, apiKey);
        return Response.json(result, { status: result.ok ? 200 : 502 });
      },
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
        const anon =
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY;
        if (!url || !anon) return new Response("Server misconfig", { status: 500 });

        const sbUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: claims, error } = await sbUser.auth.getClaims(token);
        if (error || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        const parsedUrl = new URL(request.url);
        const body = checkSchema.parse({
          request_id: parsedUrl.searchParams.get("request_id"),
          model: parsedUrl.searchParams.get("model") || undefined,
          status_url: parsedUrl.searchParams.get("status_url") || undefined,
          response_url: parsedUrl.searchParams.get("response_url") || undefined,
        });

        const result = await checkFalVideo(body, process.env.FAL_KEY);
        return Response.json(result, { status: result.ok ? 200 : 502 });
      },
    },
  },
});
