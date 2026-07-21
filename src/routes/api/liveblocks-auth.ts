/**
 * Mint un token Liveblocks (BYOK) pour autoriser un user sur une room.
 * Réponse : { ok, token } ou { ok:false, error }.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const bodySchema = z.object({
  // Rooms must be scoped: "user:<userId>:..." or "project:<projectUuid>:..."
  room: z.string().min(3).max(200).regex(/^(user|project):[A-Za-z0-9-]{8,}(?::.*)?$/),
  permissions: z.array(z.enum(["room:write", "room:read", "room:presence:write"])).default(["room:write"]),
});

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export const Route = createFileRoute("/api/liveblocks-auth")({
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
        const userId = claims.claims.sub as string;
        const email = (claims.claims.email as string | undefined) ?? null;

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json().catch(() => ({})));
        } catch (e) {
          return new Response(`Bad request: ${e instanceof Error ? e.message : "invalid"}`, { status: 400 });
        }

        const sbAdmin = createClient(url, service);

        // ── Authorize: room must belong to the caller (user:<self>:*) or a project they own
        const [scope, scopeId] = body.room.split(":");
        if (scope === "user") {
          if (scopeId !== userId) {
            return new Response("Forbidden: room not owned by caller", { status: 403 });
          }
        } else if (scope === "project") {
          if (!UUID_RE.test(scopeId)) {
            return new Response("Forbidden: invalid project id", { status: 403 });
          }
          const { data: project, error: projErr } = await sbAdmin
            .from("projects")
            .select("id")
            .eq("id", scopeId)
            .eq("owner_id", userId)
            .maybeSingle();
          if (projErr || !project) {
            return new Response("Forbidden: project not owned by caller", { status: 403 });
          }
        } else {
          return new Response("Forbidden: unsupported room scope", { status: 403 });
        }

        const { data: keyData } = await sbAdmin.rpc("get_external_key_decrypted", {
          _owner_id: userId,
          _service: "liveblocks",
        });
        const apiKey = (keyData as string | null) || process.env.LIVEBLOCKS_SECRET_KEY || null;
        if (!apiKey) {
          return Response.json(
            { ok: false, error: "LIVEBLOCKS_SECRET_KEY manquante : ajoute ta clé Liveblocks dans Réglages → Intégrations." },
            { status: 400 },
          );
        }

        const r = await fetch("https://api.liveblocks.io/v2/authorize-user", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            userInfo: { email },
            permissions: { [body.room]: body.permissions },
          }),
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          return Response.json({ ok: false, error: `Liveblocks ${r.status}: ${errText.slice(0, 200)}` }, { status: 502 });
        }
        const json = (await r.json()) as { token?: string };
        if (keyData) await sbAdmin.rpc("mark_external_key_used", { _owner_id: userId, _service: "liveblocks" });
        return Response.json({ ok: true, token: json.token, room: body.room });
      },
    },
  },
});
