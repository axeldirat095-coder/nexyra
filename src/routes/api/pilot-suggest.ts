/**
 * /api/pilot-suggest — Génère un plan de pilotage (catégories + étapes + coûts)
 * à partir du brief projet via Lovable AI Gateway (BYO-Cloud, pas de clé user).
 * INSÈRE directement les lignes en DB côté server (service_role) après vérif d'org.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface Body {
  project_id: string;
  extra_context?: string;
}

interface PlanCategory {
  title: string;
  description?: string;
  estimated_cost_usd?: number;
  steps: Array<{
    title: string;
    description?: string;
    estimated_cost_usd?: number;
  }>;
}

const SCHEMA = {
  name: "emit_pilot_plan",
  description: "Émet un plan de pilotage projet structuré : catégories + étapes avec coûts API estimés en USD.",
  parameters: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Nom court de la catégorie (ex: Auth, Catalogue, Messagerie)." },
            description: { type: "string" },
            estimated_cost_usd: { type: "number", description: "Coût total estimé en USD pour cette catégorie." },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  estimated_cost_usd: { type: "number" },
                },
                required: ["title"],
              },
            },
          },
          required: ["title", "steps"],
        },
      },
    },
    required: ["categories"],
  },
} as const;

export const Route = createFileRoute("/api/pilot-suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY || !LOVABLE_API_KEY) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const token = auth.slice(7);

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userId = claims.claims.sub as string;

        const body = (await request.json()) as Body;
        if (!body.project_id) {
          return new Response(JSON.stringify({ error: "Missing project_id" }), { status: 400 });
        }

        // Vérif accès projet (RLS via client user)
        const { data: project, error: pErr } = await supabase
          .from("projects")
          .select("id, name, description, type, org_id, owner_id, metadata")
          .eq("id", body.project_id)
          .maybeSingle();
        if (pErr || !project) {
          return new Response(JSON.stringify({ error: "Project not found or forbidden" }), { status: 403 });
        }

        const briefMeta = (project.metadata as { brief?: string } | null)?.brief ?? "";

        const userPrompt = [
          `PROJET : ${project.name} (${project.type})`,
          project.description ? `Description : ${project.description}` : "",
          briefMeta ? `Brief détaillé :\n${briefMeta}` : "",
          body.extra_context ? `Contexte additionnel : ${body.extra_context}` : "",
          "",
          "Génère un plan de pilotage complet et SECTORIEL adapté à ce projet :",
          "- 4 à 8 catégories pertinentes (modules fonctionnels du domaine).",
          "- 2 à 5 étapes par catégorie, formulées comme des actions concrètes (ex: 'Créer la fiche produit avec galerie + CTA').",
          "- estimated_cost_usd : coût API tierce estimé (OpenAI, Firecrawl, etc.) pour CONSTRUIRE l'étape avec un agent comme Elena.",
          "  Ordres de grandeur : étape simple ≈ $0.05-0.20, étape moyenne ≈ $0.30-0.80, étape lourde ≈ $1-3.",
          "- Catégorie estimated_cost_usd = somme approximative de ses étapes.",
          "RIEN d'autre que les catégories — pas de prologue.",
        ].filter(Boolean).join("\n");

        // Appel Lovable AI Gateway en mode tool-call (structured output)
        let plan: { categories: PlanCategory[] } | null = null;
        try {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "Tu es un product manager senior qui structure le plan de développement d'un projet logiciel. Tu réponds uniquement via l'outil emit_pilot_plan.",
                },
                { role: "user", content: userPrompt },
              ],
              tools: [{ type: "function", function: SCHEMA }],
              tool_choice: { type: "function", function: { name: "emit_pilot_plan" } },
            }),
          });
          if (!aiRes.ok) {
            const txt = await aiRes.text().catch(() => "");
            return new Response(
              JSON.stringify({ error: `AI Gateway HTTP ${aiRes.status}: ${txt.slice(0, 200)}` }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
          }
          const aiJson = await aiRes.json();
          const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) {
            return new Response(JSON.stringify({ error: "AI did not return a structured plan" }), { status: 502 });
          }
          plan = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "AI call failed" }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!plan?.categories?.length) {
          return new Response(JSON.stringify({ error: "Empty plan returned" }), { status: 502 });
        }

        // Insertion en DB (admin pour bypasser RLS — on a déjà vérifié l'accès au projet)
        const orgId = project.org_id;
        // On garde la position basée sur les catégories existantes pour ne pas écraser
        const { data: existing } = await supabaseAdmin
          .from("pilot_categories")
          .select("position")
          .eq("project_id", body.project_id)
          .order("position", { ascending: false })
          .limit(1);
        let nextPos = (existing?.[0]?.position ?? -1) + 1;

        let insertedCats = 0;
        let insertedSteps = 0;

        for (const cat of plan.categories) {
          const { data: catRow, error: catErr } = await supabaseAdmin
            .from("pilot_categories")
            .insert({
              project_id: body.project_id,
              org_id: orgId,
              owner_id: userId,
              title: cat.title.slice(0, 120),
              description: cat.description?.slice(0, 500) ?? null,
              estimated_cost_usd: cat.estimated_cost_usd ?? null,
              position: nextPos++,
            })
            .select("id")
            .single();
          if (catErr || !catRow) continue;
          insertedCats++;

          const stepsPayload = (cat.steps ?? []).map((s, i) => ({
            project_id: body.project_id,
            org_id: orgId,
            category_id: catRow.id,
            title: s.title.slice(0, 200),
            description: s.description?.slice(0, 800) ?? null,
            estimated_cost_usd: s.estimated_cost_usd ?? null,
            position: i,
          }));
          if (stepsPayload.length > 0) {
            const { error: stepsErr } = await supabaseAdmin.from("pilot_steps").insert(stepsPayload);
            if (!stepsErr) insertedSteps += stepsPayload.length;
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            categories_added: insertedCats,
            steps_added: insertedSteps,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
