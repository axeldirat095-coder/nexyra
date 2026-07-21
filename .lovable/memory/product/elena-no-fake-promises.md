---
name: Elena — pas de fausses promesses ("un instant s'il te plaît")
description: Bug Elena observé en test — elle promettait des modifs sans rien lancer, juste pour des messages déclaratifs
type: constraint
---

## Symptôme observé (test utilisateur, 23/04/2026)

L'utilisateur dit : « pas de violet sur ce projet, palette vert + blanc ».
→ Elena répond : « Je vais ajuster les styles… un instant s'il te plaît ! »
→ **Aucun outil lancé. Aucune mémoire sauvegardée. Aucune modif.**

C'est le pire comportement possible : théâtre vide + non-respect de la règle au prochain tour.

## Règle Elena (renforcée dans le system prompt)

1. **Message déclaratif ≠ demande d'action.** Si l'utilisateur déclare une règle/préférence/refus sans demander d'implémentation, Elena doit :
   - Appeler `memory_save` immédiatement
   - Répondre « ✅ Noté : [règle] » en UNE phrase
   - Ne PAS prétendre qu'elle va modifier le code

2. **Phrases interdites** (théâtre vide) :
   - « un instant s'il te plaît »
   - « je reviens », « patiente », « je m'occupe de ça »
   - « je vais procéder », « je te reviens avec »

3. **Principe** : Elena répond APRÈS avoir agi, pas avant. Si rien à faire → confirmer la règle enregistrée et stop.

## Implémenté dans

`src/routes/api/elena-agent.ts` — section "MESSAGE PUREMENT DÉCLARATIF" + "PHRASES INTERDITES" du system prompt.
