/**
 * Seed mémoire — pré-remplit project_docs du projet actif avec :
 *  - Vision Nexyra (B2B boîte à pizza, voie A/B routing, modèle économique)
 *  - Structure et modules TopChef (l'autre projet de l'utilisateur)
 *  - Philosophie produit (anti-frictions, anti-surconsommation, modularité)
 *
 * Idempotent : tag "seed" + check de doublon par titre avant insert.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface SeedBody {
  project_id: string;
  org_id: string;
  /** Quels packs activer. Défaut : tous. */
  packs?: Array<"nexyra-vision" | "topchef" | "philosophy">;
}

const SEED_DOCS: Record<
  "nexyra-vision" | "topchef" | "philosophy",
  Array<{ title: string; content: string; tags: string[] }>
> = {
  "nexyra-vision": [
    {
      title: "[Seed] Vision Nexyra — agent IA sans plafond de verre",
      content: `Nexyra = agent IA dev "sans plafond de verre", anti-système-de-crédits-opaque type Lovable / Cursor / v0.

Différenciateur clé : ROUTAGE INTELLIGENT MULTI-VOIES par type de tâche, avec arbitrage coût/qualité.

Architecture cible — 2 voies par type de tâche :
- VOIE A "API premium" : OpenAI GPT, Anthropic Claude, Google Gemini. Pour tâches complexes (raisonnement profond, code lourd, edge cases).
- VOIE B "Open source GPU loué à la seconde" : Llama, Mixtral, DeepSeek, Qwen. Pour tâches légères/moyennes (compréhension, classif, extraction, code simple). Souvent 5-10x moins cher.

Sur la voie B : 1 type de tâche = 1 stratégie qui peut chaîner plusieurs modèles (orchestrateur + sous-modèles spécialisés). Ne pas modéliser "1 type = 1 modèle".

Modèle économique cible :
- Option 1 : forfait mensuel (style Lovable 25/50/100€).
- Option 2 (la VRAIE disruption) : 0€/mois + facturation à la conso réelle avec marge transparente.

Conso = silencieuse côté UI. Event log serveur, agrégation mensuelle. L'utilisateur consulte si il veut.`,
      tags: ["seed", "vision", "nexyra", "business"],
    },
    {
      title: "[Seed] Vision Nexyra — segmentation users",
      content: `3 segments cibles à anticiper dans l'archi :

1. Dev solo / hobbyiste → pousse open source (voie B), paye peu, marge faible × volume.
2. Entreprise / tâches critiques → ouvre voie A premium, paye en conséquence, marge plus élevée.
3. Mix possible dans un même agent (légères en open source + lourdes en premium).

Aujourd'hui : usage perso, l'utilisateur pousse au max sur la voie B pour réduire SA propre facture pendant qu'il développe Nexyra.
Demain : produit commercial. L'archi doit servir les deux sans réécriture.

Toute construction multi-tenant dès le départ : clés API par user, settings par user, isolation des données via RLS.`,
      tags: ["seed", "vision", "nexyra", "users"],
    },
  ],
  topchef: [
    {
      title: "[Seed] TopChef — projet parallèle (cœur business)",
      content: `**TopChef (Chef's Command Center)** = projet séparé de Nexyra, cœur du business utilisateur.
URL : https://toque-chef-zenith.lovable.app
Lovable ID : ea0b053d-7962-4e14-b278-01584ac83f64

Positionnement : 6-12 mois de dev restant avant lancement commercial.
Cible : pizzaiolos / restaurateurs B2B.
Logique : "boîte à pizza livrée clé en main" — tout est mâché pour l'utilisateur final.
Modèle = même philosophie que Nexyra : tout intégré, marges faibles × volume.

⚠️ Les deux projets restent SÉPARÉS. Ne jamais mélanger code/règles. TopChef tourne déjà, Nexyra démarre.
Lien possible à terme : Nexyra = boîte à outils dev IA pour finir TopChef ("cerise sur le gâteau").`,
      tags: ["seed", "topchef", "business"],
    },
    {
      title: "[Seed] TopChef — stack technique",
      content: `Stack TopChef (différente de Nexyra) :
- Vite + React 18 + TypeScript + shadcn/ui + Tailwind
- React Router DOM v6 (pas TanStack Router)
- Supabase (intégré natif)
- PWA (vite-plugin-pwa)
- Playwright + Vitest pour les tests
- framer-motion, recharts, react-grid-layout
- ~44 migrations SQL, projet mature

❗ PAS TanStack Start, PAS React 19. Si on génère du code pour TopChef, respecter sa stack.`,
      tags: ["seed", "topchef", "stack"],
    },
    {
      title: "[Seed] TopChef — modules en place",
      content: `Modules clés TopChef (pages/) :

- **Mobile app** (src/pages/mobile/ + src/pages/my/) : interface principale utilisateur final
- **Recettes** : Recipes.tsx + auto-generate-recipe(s), batch-generate-recipes, enrich-recipe-images, verify-recipe-images, fill-fait-maison, cleanup-recipes — gros pipeline d'enrichissement avec Firecrawl
- **Vinted** : MyVinted.tsx + vinted-deals/generate/search — annonces avec génération de référence auto (format [Genre][Age]-[CatCode]-[Index] ex G10A-SH-001), modification manuelle conservée
- **FDJ** : MobileFDJ.tsx + fdj-scrape/fdj-analyze — analyse EuroMillions/Loto via Firecrawl
- **Agents IA** : AIAgents, AgentChat, AxelChat, GptChat, Chat — agents nommés (Elsa principale, Axel, Clara…)
- **Voix** : edge-tts (Microsoft, gratuit illimité, voix françaises), openai-tts en fallback, prosodie réglable par agent
- **Prospection** : Prospection, ProspectionPizzeria, alix-prospect-search, alix-sirene-search, alix-web-prospect — recherche entreprises
- **Business** : Clients, Orders, Products, Stock, MarginCalculator, Marketing, Documents, Weather, MobileOrder
- **Système** : process-agent-tasks, CronApi, drive-import/scan-folders, generate-document, gpt-chat`,
      tags: ["seed", "topchef", "modules"],
    },
    {
      title: "[Seed] TopChef — patterns récurrents",
      content: `Patterns de dev observés sur TopChef (à respecter quand on génère du code compatible) :

1. **Pipeline "1 crédit = workflow complet"** : ex FDJ → 1 bouton lance scrape + analyze + UI update.
2. **Firecrawl partout** : recettes, FDJ, prospection — c'est le scraper principal.
3. **Edge TTS** comme voix par défaut (gratuit) + ElevenLabs envisagé en premium.
4. **Génération de référence métier** avec règles strictes (Vinted : format codifié, anti-doublon).
5. **Optimisation perf** : useMemo / useCallback / lazy loading systématiques sur grosses pages.
6. **Édition chirurgicale** : modifs ciblées, jamais de rewrite complet.`,
      tags: ["seed", "topchef", "patterns"],
    },
  ],
  philosophy: [
    {
      title: "[Seed] Philosophie produit — anti-frictions",
      content: `Règles produit issues du vécu Lovable / TopChef :

- **Anti-frictions** : tout doit être en 1 clic. Si l'utilisateur final doit configurer 3 trucs avant d'utiliser, c'est raté.
- **Anti-surconsommation** : pas de modal qui brûle des crédits par accident, pas de re-roll auto, pas de retry infini. UN auto-retry max par erreur unique, fenêtre courte.
- **Modularité** : chaque module doit pouvoir être désactivé sans casser le reste. Pas de couplage en dur.
- **Transparence quotas** : l'utilisateur voit son usage MAIS sans UI clignotante. Affichage discret, consultation à la demande.
- **Mâcher le travail** : philosophie boîte à pizza — l'utilisateur final n'a RIEN à comprendre. Tout est pré-cuit.
- **Marges faibles × volume** : on préfère 1000 users à 10€/mois que 10 users à 1000€/mois. Démocratiser.

Ces règles s'appliquent à Nexyra ET à TopChef.`,
      tags: ["seed", "philosophy", "ux"],
    },
    {
      title: "[Seed] Philosophie dev — édition chirurgicale",
      content: `Règles de génération de code pour Elena :

- **Édition chirurgicale** : préférer search-replace ciblé à un rewrite complet de fichier. Coût ↓, risque ↓.
- **Lecture avant écriture** : toujours read_file avant de modifier (sauf si fichier déjà inliné dans le prompt).
- **Récap visible** : après chaque tour, lister les fichiers touchés + 1 phrase d'effet visible. Pas de blabla.
- **Pas de plan verbeux** : planifier en silence, lancer les outils directement. Pas de balise <plan> ou <thinking>.
- **Économe en tokens** : touche le minimum de fichiers. 1 fichier touché = 1 mutation. Évite les "améliorations bonus" non demandées.
- **Honnête** : dire ce qui est vrai, pas ce qui plaît. Soulever les problèmes techniques réels.`,
      tags: ["seed", "philosophy", "dev"],
    },
  ],
};

export const Route = createFileRoute("/api/seed-memory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
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
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userId = claims.claims.sub as string;

        const body = (await request.json().catch(() => ({}))) as Partial<SeedBody>;
        if (!body.project_id || !body.org_id) {
          return new Response(JSON.stringify({ error: "project_id and org_id required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const packs = body.packs ?? ["nexyra-vision", "topchef", "philosophy"];

        // Récupère titres déjà présents pour éviter les doublons
        const { data: existing } = await supabase
          .from("project_docs")
          .select("title")
          .eq("project_id", body.project_id)
          .like("title", "[Seed]%");
        const existingTitles = new Set((existing ?? []).map((r) => r.title));

        const toInsert: Array<{
          project_id: string;
          org_id: string;
          owner_id: string;
          title: string;
          content: string;
          tags: string[];
        }> = [];
        for (const pack of packs) {
          const docs = SEED_DOCS[pack];
          if (!docs) continue;
          for (const d of docs) {
            if (existingTitles.has(d.title)) continue;
            toInsert.push({
              project_id: body.project_id,
              org_id: body.org_id,
              owner_id: userId,
              title: d.title,
              content: d.content,
              tags: d.tags,
            });
          }
        }

        if (toInsert.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, inserted: 0, message: "Mémoire déjà à jour." }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const { error: insertErr } = await supabase.from("project_docs").insert(toInsert);
        if (insertErr) {
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ ok: true, inserted: toInsert.length, packs }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
