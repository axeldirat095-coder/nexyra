---
name: elena-v2-architecture
description: Architecture cible Elena V2 — moteur de construction logicielle multi-agent qui doit dépasser Lovable/Bolt
type: feature
---

**Vision** : Elena V2 = agent virtuel de construction logicielle. Pas un chat qui pousse du HTML, un vrai moteur multi-fichiers qui compile, lit ses erreurs, regarde son rendu et corrige.

**Objectif explicite user** : "faire mieux que Lovable/Bolt", pas égaler.

## Stack moteur

- **Workspace** : WebContainer (StackBlitz) côté navigateur. Vrai Node.js, vrai Vite, vrai HMR. Gratuit, 0 infra.
- **Évolution V2.5** : container serveur (E2B / Fly Machines) pour projets nécessitant backend persistant / cron / ports publics.
- **Route dédiée** : `/dev2` — isolée car WebContainer exige headers `COOP: same-origin` + `COEP: require-corp` (peut casser OAuth popups, Stripe embed, iframes externes sans CORP).
- **Sandbox HTML legacy** (`/dev` + `SandboxContext` + `LivePreview`) : **dépréciée**, à supprimer après migration projets existants.

## Architecture multi-agent (différenciateur clé)

User parle à "Elena" → orchestrateur dispatch à 4 sous-agents spécialisés :

| Agent | Modèle préf | Rôle |
|---|---|---|
| Orchestrateur (Elena) | GPT-5 / Claude Sonnet | Décompose, dispatch, synthèse user |
| Architecte | GPT-5 / o3 | Plan archi, DB schema, routes |
| Designer | Gemini 2.5 Pro | Tokens, blocs, copies images |
| Developer | DeepSeek / Qwen 2.5 (OSS bon marché) | Écrit fichiers, lit erreurs, build |
| QA Visuel | Gemini 2.5 Flash Image / GPT Vision | Screenshot → critique → patch |

**Routage modèle par task_type** dans `ai-providers.server.ts` : table `task_type → model_preference`. Lovable/Bolt = mono-modèle premium. Nous = bon modèle pour bonne tâche, économie + qualité.

## 3 différenciateurs vs Lovable/Bolt

1. **Multi-agent** spécialisé (eux : mono-agent)
2. **Boucle visuelle** : screenshot WebContainer → vision model critique → patch dev (eux : build only)
3. **Bibliothèque blocs sectoriels** indexée embeddings (table `blocks_library`) → Developer assemble plutôt qu'invente

## Outils agent (Lot 2 à venir)

`workspace_read_file`, `workspace_write_file`, `workspace_edit_file` (search-replace, jamais rewrite global), `workspace_run_command`, `workspace_read_build_errors`, `workspace_screenshot`. Pont navigateur ↔ serveur via SSE/RPC.

## État livraison

- ✅ Lot 1 : Workspace WebContainer foundation (`/dev2`, WorkspaceProvider, template Vite+React+TS+Tailwind v4, preview, terminal)
- ⏳ Lot 2 : Outils FS pour l'agent
- ⏳ Lot 3 : Orchestrateur multi-agent
- ⏳ Lot 4 : Boucle visuelle (killer feature)
- ⏳ Lot 5 : Bibliothèque blocs sectoriels
- ⏳ Lot 6 : Templates projet sectoriels
- ⏳ Lot 7 : Container serveur (V2.5 commercial)
- ⏳ Lot 8 : Migration & cleanup sandbox HTML

Plan complet : `.lovable/plan.md`.
