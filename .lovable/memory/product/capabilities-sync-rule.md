---
name: Sync obligatoire tableau /capabilities
description: Règle absolue — chaque chantier Nexyra terminé doit mettre à jour les cartes capabilities AVANT de répondre fini. Sinon dérive et perte de visibilité.
type: preference
---

# Règle : sync /capabilities à chaque chantier Nexyra

**Pourquoi** : l'utilisateur a explicitement constaté la dérive entre ce qui est codé et ce que montre `/capabilities`. Le tableau doit refléter la réalité en temps réel pour servir de base de données réutilisable sur d'autres projets similaires.

**Comment appliquer** : à la fin de TOUT chantier Nexyra (modif code Nexyra lui-même, pas projet utilisateur), AVANT de marquer terminé :

1. **Marquer en `done`** les cartes existantes qui correspondent au travail fini (UPDATE capabilities SET status='done', completed_at=now()).
2. **Ajouter de nouvelles cartes** (INSERT) pour ce qui a été fait mais n'était pas listé.
3. **Ajouter des cartes `todo`** pour tout reste identifié pendant le chantier.
4. Utiliser le tool `supabase--insert` (data, pas migration).
5. Mentionner dans la réponse finale : "Tableau /capabilities mis à jour : X cartes done, Y nouvelles."

**Ne pas faire** : terminer un chantier sans toucher capabilities. Si l'utilisateur dit "j'ai l'impression que tu mets pas à jour" → c'est cassé, fix immédiatement.

**Catégories existantes** (category_id) à réutiliser quand pertinent :
agent, agent-v2, ai, analytics, api, auth, backend, cerveau-ia, codegen, community, credits, marketing, mobile, quality, sales, templates, ui.
