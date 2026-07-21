---
name: Préférence modèles AI — pas de Gemini
description: User préfère ne pas utiliser Google Gemini pour l'instant. Utiliser uniquement modèles OpenAI via Lovable AI Gateway (gpt-5, gpt-5-mini, gpt-5-nano). Réintégration Gemini possible plus tard sur demande explicite.
type: preference
---
**Règle :** Aucun modèle `google/gemini-*` dans le code Elena V3 (sous-agents, cache, QA visuel) tant que l'utilisateur ne le demande pas explicitement.

**Mapping recommandé :**
- orchestrator / architect / developer → `openai/gpt-5-mini`
- designer → `openai/gpt-5`
- qa_visual → `openai/gpt-5-mini` (supporte vision)
- trivial_edit / cache fallback → `openai/gpt-5-nano`

**Why:** Préférence utilisateur explicite (perf/coût/cohérence). À reverser quand il le demande.
