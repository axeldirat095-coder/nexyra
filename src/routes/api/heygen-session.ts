/**
 * Mints a HeyGen Streaming Avatar session token for the signed-in user.
 * BYOK : utilise la clé HeyGen stockée dans `external_keys` (service='heygen'),
 * sinon fallback sur le secret global HEYGEN_API_KEY (provisionné côté Lovable Cloud).
 *
 * Réponse : { ok, token } — le client utilise ce token avec le SDK
 * `@heygen/streaming-avatar` pour ouvrir une session WebRTC d'avatar parlant.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/heygen-session")({
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

        const sbAdmin = createClient(url, service);
        const { data: keyData } = await sbAdmin.rpc("get_external_key_decrypted", {
          _owner_id: userId,
          _service: "heygen",
        });
        const userKey = (keyData ?? null) as string | null;
        const apiKey = userKey || process.env.HEYGEN_API_KEY || null;
        if (!apiKey) {
          return Response.json(
            {
              ok: false,
              error: "HEYGEN_API_KEY manquante : ajoute ta clé HeyGen dans Réglages → Intégrations.",
            },
            { status: 400 },
          );
        }

        const r = await fetch("https://api.heygen.com/v1/streaming.create_token", {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          return Response.json({ ok: false, error: `HeyGen ${r.status}: ${errText.slice(0, 200)}` }, { status: 502 });
        }
        const j = (await r.json()) as { data?: { token?: string } };
        const sessionToken = j.data?.token;
        if (!sessionToken) {
          return Response.json({ ok: false, error: "HeyGen: pas de token retourné" }, { status: 502 });
        }
        if (userKey) await sbAdmin.rpc("mark_external_key_used", { _owner_id: userId, _service: "heygen" });

        return Response.json({ ok: true, token: sessionToken });
      },
    },
  },
});
