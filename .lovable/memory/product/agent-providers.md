---
name: agent-providers
description: Agent Elena/Elsa — règle stricte sur les providers AI à utiliser
type: constraint
---

**RÈGLE STRICTE** : L'agent Elena (alias Elsa) doit être alimenté UNIQUEMENT par les **clés API utilisateur**, jamais par Lovable AI.

Ordre de priorité des providers :
1. **OpenAI** (provider principal — modèles gpt-5, gpt-5-mini, gpt-5-nano)
2. **Firecrawl** (scraping web — déjà connecté via connector)
3. **DeepSeek** (alternative coût/perf — à ajouter au schéma `ai_provider` enum si besoin)
4. Anthropic / Google = fallback secondaire si l'utilisateur a configuré une clé

**Why:** L'utilisateur veut maîtriser ses coûts et ne pas dépendre du quota Lovable AI. Le produit Nexyra se positionne comme "BYOK" (Bring Your Own Key).

**How to apply:**
- Toute nouvelle feature agent (tool calling, agent loop, embeddings, summarize…) doit lire la clé via `get_api_key_decrypted(owner_id, provider)`.
- **NE JAMAIS** utiliser `LOVABLE_API_KEY` ni `https://ai.gateway.lovable.dev` pour les appels Elena.
- Si l'utilisateur n'a pas de clé OpenAI → afficher un message clair "Configurez votre clé OpenAI dans Réglages" plutôt que fallback silencieux sur Lovable AI.
- DeepSeek : ajouter `'deepseek'` à l'enum `ai_provider` quand on l'implémentera (compatible OpenAI API, base URL `https://api.deepseek.com/v1`).
