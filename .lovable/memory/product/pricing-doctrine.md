---
name: Doctrine pricing & anti-surconsommation Nexyra
description: Modèle économique officiel — 3 paliers d'abo + revente IA mutualisée à faible marge + garde-fous stricts contre la surconsommation
type: feature
---

# Doctrine pricing Nexyra (validée user — mai 2026)

## Q1 — Abonnement : 3 paliers (PAS zéro abo)

L'utilisateur valide **3 paliers d'abonnement mensuels**, pas chers, chacun apportant
des **fonctionnalités différentes** (pas un simple cap de crédits comme Lovable).

Logique :
- Le palier ne se justifie pas par "plus de crédits IA" mais par **plus de features Nexyra** :
  - bouton Discuter (agent type ChatGPT capable de tout générer : texte, image, vidéo, voix sur même interface)
  - quotas projet (nb projets actifs, mémoire, snapshots, build minutes)
  - intégrations avancées (scraping, vidéo, voix premium)
  - support, collaboration, etc.
- Les 3 paliers sont **abordables** — but : que chacun s'y retrouve.
- La **vraie marge se fait sur le VOLUME d'IA revendue**, pas sur l'abo.

## Modèle de marge IA — VOLUME × FAIBLE marge

L'utilisateur travaille déjà dans d'autres business avec **3-4 % de marge** sur du volume.
Même logique pour Nexyra : **clés API mutualisées Nexyra** (toutes provisionnées par
nous : OpenAI, Anthropic, Gemini, Mistral, DeepSeek, Groq, xAI, Luma, ElevenLabs,
Replicate, Firecrawl…), revendues à l'usage avec **marge faible et transparente**
(ordre de grandeur 3-10 %).

- Pas de système de crédits opaque.
- Facturation en **€ réels**, ligne par ligne (provider, modèle, tokens, coût).
- Le débutant qui consomme 5 messages/mois paie ~0.02 € + son abo.
- Le pro qui burn paie proportionnellement.

## Q2 — Garde-fous anti-surconsommation (RÈGLE PRIMORDIALE)

**Contexte vécu user** : projet TopChef, agent Lovable avec clé Google Cloud intégrée,
mode automatique → **100 € de conso Google Cloud en une journée** sans alerte.
Lovable avait promis un "agent qui gère les coûts" — mensonge. Ce vécu = trauma
fondateur de Nexyra.

**Règle absolue Nexyra** : on **PROTÈGE** l'utilisateur des surcoûts et on l'**avertit
de suite**, **sans données faussées** sur les coûts ou les consommations.

Garde-fous obligatoires (tous combinés, non négociables) :

1. **Cap mensuel par défaut** sur chaque abo
   (ex Starter = 5 €/mois IA max, Pro = 25 €, Studio = 100 €). Réglable par l'user.
2. **Compteur conso temps réel** visible en permanence (sidebar / topbar) :
   `€ consommés / cap mensuel`, jamais en crédits.
3. **Alertes automatiques** à 50 % / 80 % / 100 % du cap (toast + email).
4. **Confirmation explicite** pour toute action coûteuse estimée
   (ex "Cette vidéo va consommer ~1.20 €. Continuer ?").
5. **Hard stop à 100 %** : on bloque, on n'autorise pas le dépassement silencieux.
   L'user doit explicitement augmenter son cap pour continuer.
6. **Aucun mode "automatique" qui consomme sans surveillance** — un agent qui boucle
   doit être stoppé par le cap, jamais par la chance.
7. **Transparence brute** : chaque appel = 1 ligne dans `usage_logs` (provider, modèle,
   tokens in/out, coût provider, marge Nexyra, coût final user). Consultable.
8. **Estimations honnêtes** : si Elena ne peut pas estimer fiablement → afficher `~?`
   et pas une valeur inventée (cohérent avec `mem://product/cost-estimation`).

## ADN vs Preview (rappel)

- **Clés Nexyra mutualisées** = ADN du produit. Elles alimentent Elena ET les actions
  user (génération, image, vidéo, scraping…).
- **Clés user (BYOK optionnel)** = uniquement pour leur **projet preview** s'ils veulent
  utiliser leur propre compte (ex un dev qui a déjà OpenAI). Ne touchent jamais Elena.

## Anti-fragmentation (rappel)

- Lovable scinde les requêtes pour multiplier les crédits facturés.
- Nexyra **regroupe** au maximum : 1 conso = 1 action utile, quitte à mettre 2 min.
- L'user préfère une IA qui prévient "je traite tout d'un bloc, ça prend 2 min" plutôt
  qu'une IA qui dit "lot 6/10" et facture 30 crédits pour livrer la moitié.

## Implémentation prioritaire `/dev2`

Dans cet ordre :
1. **Page Intégrations Nexyra** = catalogue complet ~15 providers, statut clé Nexyra
   (✅ active / 🟡 dégradée / ⚫ off), toggle activation par catégorie
   (Structure / Design / Image / Vidéo / Voix / Scrape), pas de saisie de clé user
   sauf section "BYOK preview" séparée et clairement étiquetée.
2. **Page Préférences routage** : choix modèle par catégorie (ex "Image → Luma | Replicate | Gemini-image"),
   défauts intelligents Nexyra, alertes si choix sous-optimal ("DeepSeek insuffisant
   pour structure, on recommande GPT-5") — **alerte, pas blocage**.
3. **Compteur conso temps réel + cap mensuel** dans sidebar workspace.
4. **Hard stop + alertes 50/80/100 %**.
5. **Router serveur déterministe** lit ces préférences, pas Elena qui décide à la volée.

## À NE JAMAIS FAIRE (constraints)

- ❌ Système de crédits opaque type Lovable.
- ❌ Mode auto qui consomme sans cap.
- ❌ Estimations inventées affichées comme certaines.
- ❌ Clés user qui touchent Elena (briserait l'ADN Nexyra).
- ❌ Marge cachée > 10 %.
- ❌ Fragmentation artificielle des requêtes pour gonfler la facture.
