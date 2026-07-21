---
name: Elena Claude vision routing + cache
description: reverse_engineer_reference utilise Claude Sonnet 4.5 + cache par hash d'images dans llm_cache (coût ~0 sur itérations même visuel). Prompt enrichi pour capturer voiles lumineux/glows.
type: feature
---

Pour la reproduction depuis maquette, Claude Sonnet 4.5 = meilleur modèle vision (Lovable/v0/Bolt). Routing :

1. `reverse_engineer_reference` (elena-e2b.ts + elena-workspace.ts) appelle `getUserAnthropicKey(userId)`.
2. Si clé présente → `reverseEngineerWithClaude` (claude-sonnet-4-5 via @ai-sdk/anthropic).
3. Si absente ou erreur → fallback transparent sur `openai/gpt-5.2`.

**Cache (anti-coût)** : `reverseEngineerWithClaude` hash le contenu réel des images (sha256 des bytes, sorted) + version de prompt, puis stocke le contrat dans `llm_cache` (task_type='claude-vision-reverse-engineer'). Les itérations sur le MÊME visuel = 0 appel Claude même si l'URL signée change. La clé NE dépend PAS du user_request, mais le contrat retourné réinjecte toujours la demande utilisateur en priorité absolue pour éviter qu'une correction "supprime/modifie" soit noyée par le cache.

**Prompt enrichi** : insiste explicitement sur les VOILES LUMINEUX, halos, glows traversant plusieurs sections (ex : voile bleu→violet partant du sweat jusqu'à la carte stats). Souvent oubliés à la 1ʳᵉ passe — section #8 dédiée avec hex/opacity/blur/forme obligatoires. Si plusieurs images sont envoyées, Claude doit les classer (original / rendu actuel / annotations) et produire "À SUPPRIMER" + "À MODIFIER" quand visible.

**QA anti-approximation** : après un `write_file` basé sur une référence image, Elena E2B doit appeler `qa_reference_code` avec images + contrat + code (`App.tsx`/CSS). Ce contrôle compare la référence au code et renvoie `OK/FIX/REFAIRE`; si `FIX` ou `REFAIRE`, Elena corrige avant de répondre. But : éviter le rendu “dans l’esprit” quand l’utilisateur demande “à l’identique”.

Le reste de la boucle (architecte, designer, developer, write_file) reste sur OpenAI BYOK.
