import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/elena-summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            return jsonError("Server misconfigured", 500);
          }

          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) return jsonError("Unauthorized", 401);
          const token = authHeader.slice(7);

          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          const { data: claims } = await supabase.auth.getClaims(token);
          if (!claims?.claims?.sub) return jsonError("Unauthorized", 401);

          const body = (await request.json()) as { conversation_id: string };
          if (!body.conversation_id) return jsonError("Missing conversation_id", 400);

          const { data: conv } = await supabase
            .from("conversations")
            .select("id, owner_id")
            .eq("id", body.conversation_id)
            .maybeSingle();
          if (!conv) return jsonError("Conversation not found", 404);

          const { data: msgs } = await supabase
            .from("messages")
            .select("role, content")
            .eq("conversation_id", body.conversation_id)
            .order("created_at", { ascending: true });
          if (!msgs || msgs.length < 5) return jsonError("Not enough messages", 400);

          // Récupère la clé OpenAI admin
          const { data: adminRow } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!adminRow?.user_id) return jsonError("No admin", 500);

          // Tente d'abord Google (Gemini Flash Lite ~15× moins cher), fallback OpenAI nano
          const { data: googleKey } = await supabaseAdmin.rpc("get_api_key_decrypted", {
            _owner_id: adminRow.user_id,
            _provider: "google",
          });
          const { data: openaiKey } = await supabaseAdmin.rpc("get_api_key_decrypted", {
            _owner_id: adminRow.user_id,
            _provider: "openai",
          });
          if (!googleKey && !openaiKey) return jsonError("No API key", 412);

          const transcript = msgs
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n\n")
            .slice(0, 12000);

          const systemPrompt =
            "Résume cette conversation en 5-8 phrases factuelles, en français. Garde les décisions, le contexte projet et les éléments à retenir pour continuer.";

          let summary = "";
          let usedProvider: "google" | "openai" = "openai";

          if (googleKey) {
            try {
              const gRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${googleKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: "user", parts: [{ text: transcript }] }],
                  }),
                },
              );
              if (gRes.ok) {
                const gJson = await gRes.json();
                summary = gJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                usedProvider = "google";
              } else {
                console.warn("gemini-flash-lite failed", gRes.status);
              }
            } catch (e) {
              console.warn("gemini call threw", e);
            }
          }

          if (!summary && openaiKey) {
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-5-nano",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: transcript },
                ],
              }),
            });
            if (!resp.ok) return jsonError(`OpenAI ${resp.status}`, 502);
            const json = await resp.json();
            summary = json.choices?.[0]?.message?.content ?? "";
            usedProvider = "openai";
          }

          if (!summary) return jsonError("Empty summary", 502);
          console.log(`[elena-summarize] provider=${usedProvider} chars=${summary.length}`);

          await supabase
            .from("conversations")
            .update({ summary, messages_since_summary: 0 })
            .eq("id", body.conversation_id);

          return new Response(JSON.stringify({ summary }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("elena-summarize fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown", 500);
        }
      },
    },
  },
});
