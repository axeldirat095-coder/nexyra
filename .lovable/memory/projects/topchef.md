---
name: TopChef (Chef's Command Center)
description: Projet commercial parallèle — cockpit pizzaiolo / restauration. Distinct de Nexyra. URL toque-chef-zenith.lovable.app.
type: reference
---

# TopChef — Chef's Command Center

**Projet séparé de Nexyra.** À ne pas confondre.
URL : https://toque-chef-zenith.lovable.app
ID Lovable : ea0b053d-7962-4e14-b278-01584ac83f64

## Positionnement business
Cœur du business de l'utilisateur. 6-12 mois de dev restant avant lancement commercial.
Cible : pizzaiolos / restaurateurs. Logique : "boîte à pizza livrée clé en main" — tout est mâché pour l'utilisateur final.
Modèle = même philosophie que Nexyra : tout intégré, marges faibles × volume.

## Stack technique
- Vite + React 18 + TS + shadcn/ui + Tailwind (PAS TanStack Start, PAS React 19)
- React Router DOM v6 (pas TanStack Router)
- Supabase (intégré natif, pas via Lovable Cloud apparemment — vérifier)
- PWA (vite-plugin-pwa)
- Playwright + Vitest pour les tests
- framer-motion, recharts, react-grid-layout
- ~44 migrations SQL, projet mature

## Modules en place (pages/)
- **Mobile app** (`src/pages/mobile/` + `src/pages/my/`) : interface principale utilisateur final
- **Recettes** : Recipes.tsx + auto-generate-recipe(s), batch-generate-recipes, enrich-recipe-images, verify-recipe-images, fill-fait-maison, cleanup-recipes — gros pipeline d'enrichissement avec Firecrawl
- **Vinted** : MyVinted.tsx + vinted-deals/generate/search — système d'annonces avec génération de référence auto (format `[Genre][Age]-[CatCode]-[Index]` ex `G10A-SH-001`), modification manuelle conservée
- **FDJ** : MobileFDJ.tsx + fdj-scrape/fdj-analyze — analyse EuroMillions/Loto via Firecrawl
- **Agents IA** : AIAgents, AgentChat, AxelChat, GptChat, Chat — agents nommés (Elsa principale, Axel, Clara…)
- **Voix** : edge-tts (Microsoft, gratuit illimité, voix françaises), openai-tts en fallback, prosodie réglable par agent
- **Prospection** : Prospection, ProspectionPizzeria, alix-prospect-search, alix-sirene-search, alix-web-prospect — recherche entreprises
- **Business** : Clients, Orders, Products, Stock, MarginCalculator, Marketing, Documents, Weather, MobileOrder
- **Système** : process-agent-tasks, CronApi, drive-import/scan-folders, generate-document, gpt-chat

## Patterns récurrents observés
1. **Pipeline "1 crédit = workflow complet"** : ex FDJ → 1 bouton lance scrape + analyze + UI update
2. **Firecrawl partout** : recettes, FDJ, prospection — c'est le scraper principal
3. **Edge TTS** comme voix par défaut (gratuit) + ElevenLabs envisagé en premium
4. **Génération de référence métier** avec règles strictes (Vinted : format codifié, anti-doublon)
5. **Optimisation perf** : useMemo / useCallback / lazy loading systématiques sur grosses pages
6. **Édition chirurgicale** : modifs ciblées, jamais de rewrite complet

## Lien avec Nexyra
TopChef = projet où l'utilisateur a APPRIS sa philosophie (mâcher le travail, marges faibles × volume, pipelines agents).
Nexyra = la boîte à outils de dev IA qu'il aimerait à terme utiliser pour finir TopChef ("cerise sur le gâteau").
**Les deux projets restent séparés** : ne jamais mélanger code/règles. TopChef tourne déjà, Nexyra démarre.

## Formation perso de l'utilisateur
Il s'est formé en profondeur (PDFs Guide_Agent_IA_Developpement v1/v2, Formation_Complete_IA_Dev — RAG, multi-agents, n8n, Docker, RLS, prompting avancé). Niveau actuel : sait raisonner architecture, pose les bonnes questions techniques.
