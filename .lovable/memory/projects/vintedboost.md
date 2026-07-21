---
name: VintedBoost (clone Bleam pour TopChef)
description: Idée projet — extension Chrome + dashboard TopChef pour automatiser Vinted (republication, négo IA, messages favoris). À développer DANS TopChef, pas Nexyra.
type: reference
---

# VintedBoost — Clone Bleam intégré à TopChef

## Origine
Avril 2026 — utilisateur a découvert https://bleam.app/fr (extension Chrome qui automatise Vinted, 2000+ users, 60€/mois, ~120k€ MRR). Veut faire pareil en partant de son module Vinted existant dans TopChef.

## Décisions actées
- **Projet hébergé dans TopChef**, PAS dans Nexyra (Nexyra = plateforme dev IA, TopChef = produit business).
- **Phase 1 ambition = outil perso d'abord** (zéro risque légal externe, validation techno sur compte Vinted perso de l'utilisateur).
- **Premier chantier = MVP extension Chrome qui republie** (fonction Bleam à plus haut ROI immédiat).
- **Workflow user** : création articles depuis app Vinted mobile native → extension PC sync vers TopChef → dashboard pour automatisations.

## Légalité (à retenir)
- **Loi française/UE** : légal (user automatise SON compte avec SES identifiants).
- **CGU Vinted article 5** : interdit (rupture contrat → ban compte possible, pas de poursuite pénale).
- **Réalité marché** : Bleam/Resellio/Pulpoo opèrent depuis 2+ ans sans poursuite judiciaire de Vinted.
- **Mitigation** : délais humains 3-8s aléatoires, max 50 actions/jour/compte, CGU avec clause "usage à vos risques" si commercialisation.

## Archi cible (4 phases)
1. **Dashboard TopChef enrichi** (déjà 50% via module Vinted existant) : inventaire unifié, templates IA, pricing intelligent (Firecrawl scrape concurrents), analytics.
2. **Extension Chrome MV3** : popup + content script vinted.fr, polling toutes les 30s d'une file d'actions depuis API TopChef, exécution avec délais humains.
3. **Agent IA négociateur** : réutiliser agents existants TopChef (Elsa/Axel via Lovable AI Gateway, gpt-5-mini ~0,001€/négo).
4. **Bot cloud premium (optionnel)** : Playwright sur VPS pour 24/24 sans PC allumé. Justifie tarif premium (~5€/compte/mois infra).

## Coûts estimés
- Dev MVP : 2-3 semaines avec Lovable
- Chrome Web Store : $5 one-shot
- IA négo : ~1€/mois pour 1000 négociations (Lovable AI Gateway)
- Infra phase 4 : 5-50€/mois selon nb comptes

## Ce qu'il y a déjà dans TopChef qui sert
- Module Vinted (`MyVinted.tsx` + edge functions `vinted-deals/generate/search`)
- Système de génération de référence `[Genre][Age]-[CatCode]-[Index]` (ex `G10A-SH-001`)
- Pipeline Firecrawl pour scraping (utilisable pour pricing concurrents)
- Agents IA (Elsa, Axel, Clara) + Edge TTS pour notifications vocales

## Lien avec Nexyra
**Aucun lien direct côté code.** Nexyra peut éventuellement servir à générer rapidement le squelette de l'extension Chrome ou des composants UI dashboard, mais le déploiement final reste dans TopChef.

## Prochaine étape utilisateur
Soit ouvrir TopChef dans Lovable et lancer le chantier MVP extension là-bas, soit demander à Nexyra de générer le squelette extension en .zip téléchargeable.
