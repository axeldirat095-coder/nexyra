/**
 * Lot 4.2 — QA visuel multimodal (vision pixel).
 *
 * Reçoit un screenshot JPEG (data URL) du rendu réel de la preview Elena,
 * + le brief design d'origine, et appelle GPT-5 vision pour une critique
 * pixel-level niveau Lovable. Renvoie un verdict OK/FIX et une liste de
 * fixes actionnables.
 *
 * BYOK strict : on lit la clé OpenAI du user (table external_keys via RPC
 * get_api_key_decrypted), pas de fallback Lovable AI Gateway pour la vision.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const QA_PIXEL_PROMPT = `Tu es **QA visuel pixel** de Nexyra Elena V3 — œil critique niveau Lovable / Linear / Vercel / Stripe.

On te montre **le screenshot réel** d'une UI fraîchement générée (pas le code, le rendu pixel) et le **brief design** d'origine. Tu dois noter ce que tu vois objectivement et lister les fixes actionnables.

## Critères NON négociables (note chacun: OK / FAIBLE / KO)

1. **Hiérarchie visuelle** : un H1 clair, secondaires distincts, scan-path évident en <2s.
2. **Densité & espacement** : air entre blocs, padding cartes ≥ 24px, pas de texte collé aux bords.
3. **Contraste & lisibilité** : texte lisible sur fond, pas de gris-sur-gris mou.
4. **Premium-feel vs template** : glassmorphism, gradients subtils, ombres douces, vraies icônes lucide. Pas d'emoji-icône, pas de "<div>texte</div>" brut, pas de fond blanc cassé.
5. **CTA évident** : bouton principal visible, gradient blue→violet, hover/focus implicite.
6. **Typo** : titres bold tracking-tight, sous-titres uppercase tracking-wider text-slate-400, corps text-slate-300.
7. **Cohérence** : palette unifiée, radius cohérents (rounded-2xl pour cartes), pas de mélange random.
8. **Empty/edge states** : si listes vides → état dessiné (icône + titre + CTA), jamais "0 items" brut.
9. **Mobile-readiness** : layout résiste à <768px (pas de débordement horizontal visible, grilles s'effondrent).
10. **Wow factor** : est-ce qu'un dev exigeant garderait ça en l'état ou demanderait à refaire ?

## Format de réponse (Markdown, max ~350 mots)

## Verdict
\`OK\` (premium, à garder) **ou** \`FIX\` (liste obligatoire) **ou** \`REFAIRE\` (en dessous du seuil Lovable, recommencer).

## Notes par critère
- Hiérarchie : OK/FAIBLE/KO — 1 phrase
- Densité : ...
- (les 10 critères, ultra court)

## Fixes prioritaires (3 à 7 max, par ordre d'impact)
1. **[fichier probable]** — problème visuel précis → action concrète (classes Tailwind à ajouter/changer).
2. ...

## Note finale
1 phrase. Honnête, sec, sans flatterie. Compare à Lovable / Linear si pertinent.`;

const bodySchema = z.object({
  image_base64: z
    .string()
    .min(100)
    .max(2_000_000)
    .describe("Data URL JPEG/PNG (data:image/jpeg;base64,...)"),
  design_brief: z.string().min(3).max(8000),
  context: z.string().max(4000).optional(),
});

export const Route = createFileRoute("/api/elena-qa-visual-pixel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const token = auth.slice(7);

        const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
        const anon =
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY;
        const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !anon || !service) {
          return Response.json({ ok: false, error: "Server misconfig" }, { status: 500 });
        }

        const sbUser = createClient(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: authErr } = await sbUser.auth.getClaims(token);
        if (authErr || !claims?.claims?.sub) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const userId = claims.claims.sub as string;

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "invalid body" },
            { status: 400 },
          );
        }

        const sbAdmin = createClient(url, service, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: keyData } = await sbAdmin.rpc(
          "get_api_key_decrypted" as never,
          { _owner_id: userId, _provider: "openai" } as never,
        );
        const apiKey = (keyData as string | null) ?? null;
        if (!apiKey) {
          return Response.json(
            {
              ok: false,
              error:
                "Clé OpenAI manquante. Va dans Réglages → Intégrations & API et colle ta clé sk-... pour activer le QA visuel pixel.",
            },
            { status: 412 },
          );
        }

        // gpt-5 + vision (multimodal). Reste compatible OpenAI Chat Completions.
        const userContent = [
          {
            type: "text" as const,
            text: `## Brief design d'origine\n${body.design_brief}${
              body.context ? `\n\n## Contexte\n${body.context}` : ""
            }\n\nAnalyse le screenshot ci-dessous et applique la grille de critères.`,
          },
          {
            type: "image_url" as const,
            image_url: { url: body.image_base64, detail: "high" as const },
          },
        ];

        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-5",
            messages: [
              { role: "system", content: QA_PIXEL_PROMPT },
              { role: "user", content: userContent },
            ],
            max_completion_tokens: 1400,
          }),
        });

        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          return Response.json(
            {
              ok: false,
              error: `OpenAI ${r.status}: ${errText.slice(0, 300)}`,
            },
            { status: 502 },
          );
        }
        const json = (await r.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
          model?: string;
        };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        const verdictMatch = text.match(/##\s*Verdict[^\n]*\n+`?(OK|FIX|REFAIRE)`?/i);
        const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as "OK" | "FIX" | "REFAIRE";

        try {
          await sbAdmin.rpc(
            "mark_api_key_used" as never,
            { _owner_id: userId, _provider: "openai" } as never,
          );
        } catch {
          // ignore — usage tracking best-effort
        }

        return Response.json({
          ok: true,
          verdict,
          critique: text,
          model: json.model ?? "gpt-5",
          usage: json.usage ?? null,
        });
      },
    },
  },
});
