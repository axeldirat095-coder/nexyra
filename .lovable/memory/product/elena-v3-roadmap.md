---
name: elena-v3-roadmap
description: Roadmap Elena V3.0 — workspace WebContainer multi-agent, lots 2-8 + 7 axes (cache, mémoire, dry-run, prompts versionnés, observability, multi-provider, PII)
type: feature
---

**Catégorie pilotage** : `elena-v3` (15 capabilities). Source de vérité pour Elena V3.

## Lots (suite du Lot 1 livré)

| # | Titre | Statut | Prio |
|---|---|---|---|
| 1 | Workspace WebContainer foundation | done | P0 |
| 2 | Outils FS agent (read/write/edit/run/screenshot + rename/mkdir/add_dependency/screenshot_raw + stdout capture) | done | P0 |
| 3 | Orchestrateur multi-agent (Architecte+Designer+Developer+QA) | in_progress | P0 |
| 4 | **Boucle visuelle** (screenshot → vision critique → patch) — *killer feature* | done | P0 |
| 5 | Bibliothèque blocs sectoriels indexée embeddings | todo | P1 |
| 6 | Templates projet sectoriels | todo | P1 |
| 7 | Container serveur V2.5 (E2B / Fly Machines) | todo | P2 |
| 8 | Migration & cleanup sandbox HTML legacy (`/dev` → supprimer, `/dev2` → `/dev`) | todo | P1 |

## Axes optimisation (issus analyse Elena)

| Axe | Titre | Prio |
|---|---|---|
| A | Cache LLM + routage intelligent (petits modèles pour tâches triviales) — **done sur /dev3 (elena-e2b) : classifyIntent + bascule trivial_edit si conversation** | P0 |
| B | Mémoire projet long terme (entre sessions WebContainer) | P0 |
| C | Dry-run / preview diff avant apply (sécurité) | P0 |
| D | Prompts versionnés + few-shot premium | P1 |
| E | Observabilité branchée (latence/tokens/accept rate) | P1 |
| F | Multi-provider (Claude Sonnet + DeepSeek) | P1 |
| G | PII redaction middleware (RGPD) | P1 |

## Règles d'exécution

- **Ne pas toucher** au sandbox HTML legacy (`/dev`, SandboxContext, LivePreview) avant Lot 8 — ça marche toujours et on ne dépense plus de crédits dessus.
- Toute modification Elena V3 reste dans `/dev2` + `src/components/workspace/*` + `src/routes/api/elena-workspace.ts` + `src/server/elena-subagents.server.ts`.
- Ordre attaque recommandé : Lot 2 (finir tools FS) → Axe A (cache+routing, ROI immédiat) → Lot 4 (boucle visuelle) → Axe B (mémoire) → Axe C (dry-run) → reste.
