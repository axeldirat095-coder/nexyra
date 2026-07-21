---
name: Estimation coûts API par catégorie pilotage
description: Règle métier — Elena affiche une estimation coût API par catégorie et par étape dans le tableau de pilotage
type: feature
---

# Estimation des coûts API dans le tableau de pilotage

## Règle (avril 2026)

Dans le mode BYOK (l'utilisateur paye directement les API via ses propres clés, pas via crédits Lovable), **chaque catégorie du tableau de pilotage doit afficher une estimation de coût API** à côté de son titre.

## Détails

- **Niveau étape** : chaque étape porte son propre `estimated_cost_usd` (coût API estimé pour la générer + la faire tourner si applicable).
- **Niveau catégorie** : `estimated_cost_usd` = somme des coûts de ses étapes (calculée à l'affichage ou stockée en cache).
- **Affichage UI** : badge à côté du titre de la catégorie (ex: `Catalogue · ~$0.42`).
- **Devise** : USD (cohérent avec le reste de la facturation API).

## Périmètre actuel

Estimations basées sur les API payantes utilisées par Elena :
- OpenAI (gpt-5, gpt-5-mini, gpt-5.2)
- Anthropic (Claude)
- xAI, Mistral
- Firecrawl (scraping)

## À affiner plus tard

Quand le projet utilisera aussi des API open-source / self-hosted, le calcul devra :
- Distinguer coûts API tierces vs coûts infrastructure.
- Pondérer selon le provider choisi par l'utilisateur.
- Afficher une fourchette min/max plutôt qu'un point unique.

## Comment Elena calcule

Au moment où Elena génère le plan (catégories + étapes), elle estime pour chaque étape :
- Nombre d'appels LLM prévus × coût moyen par appel (selon modèle).
- Appels outils externes (web_search, scrape) × coût unitaire.
- Marge de sécurité ×1.3.

Si l'estimation n'est pas fiable, mettre `estimated_cost_usd = NULL` et afficher `~?` plutôt qu'une valeur fausse.
