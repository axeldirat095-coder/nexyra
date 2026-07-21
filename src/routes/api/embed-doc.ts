import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateEmbedding, toPgVector } from "@/server/embeddings.server";

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/embed-doc")({
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

          const body = (await request.json()) as { doc_id: string };
          if (!body.doc_id) return jsonError("Missing doc_id", 400);

          // RLS s'occupe de vérifier l'accès — on lit avec le client utilisateur
          const { data: doc, error: readErr } = await supabase
            .from("project_docs")
            .select("id, title, content")
            .eq("id", body.doc_id)
            .maybeSingle();
          if (readErr || !doc) return jsonError("Doc not found", 404);

          // Récupère la clé OpenAI admin (mutualisée pour les embeddings)
          const { data: adminRow } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!adminRow?.user_id) {
            return jsonError("No admin configured for embeddings", 412);
          }
          const { data: keyData } = await supabaseAdmin.rpc("get_api_key_decrypted", {
            _owner_id: adminRow.user_id,
            _provider: "openai",
          });
          const apiKey = keyData as string | null;
          if (!apiKey) {
            return jsonError("No OpenAI key for embeddings", 412);
          }

          // Génère l'embedding sur title + content
          const text = `${doc.title}\n\n${doc.content}`;
          const vec = await generateEmbedding(text, apiKey);
          if (!vec) return jsonError("Embedding generation failed", 502);

          // Update via service role (bypass RLS pour écrire le vecteur déjà calculé sur un doc accessible)
          // On reste safe : on n'écrit que sur le doc dont l'utilisateur a déjà prouvé l'accès via supabase (lecture RLS-vérifiée).
          const { error: updErr } = await supabaseAdmin
            .from("project_docs")
            .update({
              embedding: toPgVector(vec) as never,
              embedding_updated_at: new Date().toISOString(),
            })
            .eq("id", doc.id);
          if (updErr) return jsonError(updErr.message, 500);

          return new Response(
            JSON.stringify({ ok: true, dims: vec.length }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          console.error("embed-doc fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown", 500);
        }
      },
    },
  },
});
