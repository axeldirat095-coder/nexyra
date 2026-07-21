---
name: Cost Reduction Roadmap
description: Backlog d'optimisations pour réduire les coûts AI de Nexyra sans dégrader la qualité.
type: feature
---

# Roadmap réduction des coûts

## ✅ Phase 1 — LIVRÉE (estimation -50 à -65% sur facture OpenAI)
1. **Cache élargi** (elena-chat.ts, 4000 chars + project_id dans la clé).
2. **Routing eco par défaut** (`detectIntentLevel`).
3. **Compression contexte** (12 messages max, RAG tronqué à 800 chars).

## ✅ Phase 2.1 — LIVRÉE (Pilotage temps réel)
4. **Tableau de pilotage** /admin → "Coûts & budget" :
   - Refresh auto 60s + bouton manuel.
   - KPIs : coût période, tokens, mois en cours, **part éco %**, **cache hit rate %**.
   - Bloc **Distribution routing** (eco/standard/premium/auto) : barre stacked + cards.
   - SQL function `get_routing_distribution(_days)` agrège `messages.metadata.intent_level`.
   - elena-chat.ts trace `intent_level` + `intent_kind` dans metadata (3 chemins: cache hit, fallback, normal).

## ✅ Phase 2.2 — LIVRÉE (Batching embeddings)
5. **Batching embeddings** — `generateEmbeddingsBatch` (lots de 20) dans `embeddings.server.ts`. Utilisé par `import-project` : 1 appel HTTP OpenAI pour N docs au lieu de N appels. Updates Postgres en parallèle (5 par 5). Réponse renvoie `embedded` count.

## ✅ Phase 2.3 — LIVRÉE (Résumés éco)
6. **elena-summarize** route Google Gemini Flash Lite en priorité (clé `google` BYOK), fallback `gpt-5-nano` (au lieu de `gpt-5-mini`). Logge le provider utilisé.

## ✅ Phase 3 — LIVRÉE (Quotas projets & mode brouillon)
7. **Quotas par projet** — table `project_quotas` (limite mensuelle USD + hard_block) avec RLS (admin + owner SELECT). Fonction `check_project_quota(_user_id, _project_id)` combine quota user + projet. elena-chat appelle cette RPC à chaque message.
8. **Mode brouillon** — colonne `projects.draft_mode`. Quand `true`, elena-chat force `mode_override="eco"` (cap automatique sur gemini flash lite / nano), même si l'utilisateur choisit Premium.
9. **UI admin** — section "Quotas projets" : usage mois en cours par projet, toggle brouillon, hard-block, édition limite.

## ✅ Phase 4 — LIVRÉE (Elena prod-ready)
10. **Alertes budget 80/100%** — table `budget_notifications` + trigger sur `messages` (dédup 1/jour/scope). RPC `get_project_budget_status` pour usage temps réel.
11. **UI quotas dans /dev** — `ProjectBudgetCard` (usage temps réel, refresh 30s, toggle Brouillon owner-only) dans la topbar.
12. **Cloche d'alertes** — `BudgetNotificationsBell` realtime (toast + popover historique, marque-lu auto à l'ouverture).
13. **Bouton Stop streaming** — `useElenaChat.stop()` exposé, bouton rouge remplace Send pendant le stream.
14. **Toasts contextuels 412/401/429** — actions cliquables vers `/settings` (recoller clé OpenAI).

## ⚠️ Règle Nexyra
**Pas de Lovable AI dans la chaîne** — système indépendant strict (BYOK OpenAI/Anthropic/Google).
