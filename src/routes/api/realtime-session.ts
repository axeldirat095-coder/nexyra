/**
 * Mints an ephemeral OpenAI Realtime session token for the signed-in user.
 * BYOK : utilise la clé OpenAI stockée dans `external_keys` (service='openai').
 *
 * Réponse : { ok, client_secret, expires_at, model } ou { ok:false, error }.
 * Le navigateur utilise ensuite ce token pour ouvrir une WebRTC vers
 * https://api.openai.com/v1/realtime — la clé maître n'est jamais exposée.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const bodySchema = z.object({
  model: z.string().default("gpt-4o-realtime-preview-2024-12-17"),
  voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]).default("verse"),
  instructions: z.string().max(8000).optional(),
});

export const Route = createFileRoute("/api/realtime-session")({
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
        const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !anon || !service) return new Response("Server misconfig", { status: 500 });

        const sbUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: claims, error } = await sbUser.auth.getClaims(token);
        if (error || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claims.claims.sub;

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json().catch(() => ({})));
        } catch (e) {
          return new Response(`Bad request: ${e instanceof Error ? e.message : "invalid"}`, { status: 400 });
        }

        // Récupère la clé OpenAI BYOK de l'utilisateur (via service-role pour décrypter)
        const sbAdmin = createClient(url, service);
        const { data: keyData, error: keyErr } = await sbAdmin.rpc("get_external_key_decrypted", {
          _owner_id: userId,
          _service: "openai",
        });
        const userKey = (keyData ?? null) as string | null;
        const apiKey = userKey || process.env.OPENAI_API_KEY || null;
        if (keyErr || !apiKey) {
          return Response.json(
            { ok: false, error: "OPENAI_API_KEY manquante : ajoute ta clé OpenAI dans Réglages → Intégrations." },
            { status: 400 },
          );
        }

        const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: body.model,
            voice: body.voice,
            ...(body.instructions ? { instructions: body.instructions } : {}),
          }),
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          return Response.json({ ok: false, error: `OpenAI ${r.status}: ${errText.slice(0, 200)}` }, { status: 502 });
        }
        const session = (await r.json()) as {
          client_secret?: { value: string; expires_at: number };
          model?: string;
        };
        if (userKey) await sbAdmin.rpc("mark_external_key_used", { _owner_id: userId, _service: "openai" });

        return Response.json({
          ok: true,
          client_secret: session.client_secret?.value,
          expires_at: session.client_secret?.expires_at,
          model: session.model ?? body.model,
        });
      },
    },
  },
});
