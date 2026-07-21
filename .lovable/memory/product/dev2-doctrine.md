---
name: dev2-doctrine
description: Doctrine de travail sur /dev2 — anti-gaspillage crédits, rebuild propre, pas de bascule prématurée
type: constraint
---

**RÈGLES ABSOLUES sur le chantier `/dev2` (Elena V3 workspace) :**

1. **`/dev` legacy = intouchable.** Buggé, patché à mort, jamais propre. On ne migre rien dedans, on ne corrige plus rien dedans. Lot 8 (bascule `/dev2 → /dev`) ne se fait QUE quand l'utilisateur dit explicitement "go".

2. **`/dev2` = base neuve, rebuild from scratch.** Réglages, clés API, boutons, UI : tout est repensé proprement DANS `/dev2`. Interdiction de copier-coller des composants legacy (`SandboxContext`, `LivePreview`, ancien settings) — on perpétuerait les bugs.

3. **Nexyra (home, pages publiques, `/dev` legacy) = figé.** Aucun changement tant que `/dev2` n'est pas validé terrain.

4. **Anti-gaspillage crédits Lovable — DOCTRINE :**
   - Grouper les changements liés en UN seul tour (pas 3 messages successifs)
   - `ask_questions` UNIQUEMENT si vraiment bloquant — jamais pour de la déco / du goût
   - Pas de patch-on-patch : si une zone a déjà été patchée, refactor net OU attendre validation user
   - Pour chaque chantier `/dev2`, lister AVANT : fichiers touchés + scope, pour que l'user puisse dire stop
   - Elena elle-même doit appliquer cette discipline : quotas durs tools/tokens par session, pas de "veux-tu que…", `dry_run` avant write multi-fichiers

4bis. **Contrat de vérité technique — obligatoire avant de vendre une feature comme “fonctionnelle” :**
   - Distinguer explicitement : `UI seulement`, `câblé backend`, `testé en live`, `non câblé`.
   - Interdiction de créer des boutons/réglages/intégrations décoratifs : chaque contrôle doit avoir un chemin d'exécution réel ou être marqué “à connecter”.
   - Pour chaque provider/outils (OpenAI, DeepSeek, image, vidéo, audio…), documenter : clé attendue, table/source de lecture, route consommatrice, outil qui l'utilise, preuve de test.
   - Avant tout chantier, auditer l’existant et dire franchement ce qui marche / ce qui ne marche pas / ce qui est du prototype.
   - Aucun “réessaie” après un patch sans validation pertinente : logs, build_check, test provider, ou preuve UI selon le cas.

5. **Ordre de chantier `/dev2` validé (peut évoluer) :**
   1. Settings BYOK rebuild natif dans le workspace (clés OpenAI/DeepSeek/Firecrawl + test live)
   2. Outils image/vidéo natifs Elena (image_generate, image_edit, video_generate)
   3. Quotas anti-gaspillage Elena (limites + UI transparente)
   4. Enrichissement boucle visuelle (capture_pixel + auto-correction)
   5. Mémoire projet long-terme (Axe B)
   6. Tests terrain par l'user
   7. Lot 8 bascule `/dev2 → /dev` SEULEMENT sur "go" explicite

**Why:** L'user a été échaudé par le pattern Lovable historique (patchs successifs, gaspillage crédits, jamais d'outil qui marche vraiment). `/dev2` est sa seconde chance — il refuse de reproduire les erreurs.
