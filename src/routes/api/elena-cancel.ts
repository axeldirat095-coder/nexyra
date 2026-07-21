/**
 * Elena Agent Cancel — bouton "Stop" qui arrête vraiment l'agent côté serveur.
 *
 * Insère un signal dans `agent_cancellations`. La boucle agent vérifie cette
 * table entre chaque itération via `is_agent_cancelled` et abort proprement.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface CancelBody {
  conversation_id: string;
}

export const Route = createFileRoute("/api/elena-cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) {
          return new Response(JSON.stringify({ error: "missing_token" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        const supabase = createClient<Database>(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) {
          return new Response(JSON.stringify({ error: "unauthenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: CancelBody;
        try {
          body = (await request.json()) as CancelBody;
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!body.conversation_id) {
          return new Response(JSON.stringify({ error: "missing_conversation_id" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const supabaseAdmin = createClient<Database>(supabaseUrl, serviceKey);
        // Vérifie ownership avant insertion
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("owner_id")
          .eq("id", body.conversation_id)
          .single();
        if (!conv || conv.owner_id !== userData.user.id) {
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        const { error: insertErr } = await supabaseAdmin
          .from("agent_cancellations")
          .insert({
            conversation_id: body.conversation_id,
            cancelled_by: userData.user.id,
          });
        if (insertErr) {
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, cancelled_at: new Date().toISOString() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
