---
name: Elena Behavior & Interface Roadmap
description: Gros chantier comportement Elena — mémoire, structuration étape par étape, tableau de pilotage projet intégré dans /dev, ordre interface-first
type: feature
---

# Elena — Comportement & Interface (chantier majeur)

Référence stable pour ce chantier. À attaquer par catégories, prompt par prompt (cf. méthode tableau de pilotage utilisée pour Nexyra côté Lovable).

## Constat utilisateur (avril 2026)
- Elena oublie le contexte du projet entre messages (ex: décrit "app Vinted" puis génère un Hero générique).
- Elena empile son code sur le template par défaut au lieu de remplacer / partir propre.
- Pas de structuration étape par étape : un seul prompt = une réponse fourre-tout, pas de découpage en sous-étapes validées.
- Quand l'utilisateur intercale une question, Elena perd le fil de l'étape en cours (même problème que Lovable côté Nexyra).
- Pas de "mémoire produit" persistante par projet (équivalent de `mem://` côté Lovable).

## Vision cible
Elena doit se comporter **comme l'agent Lovable** côté utilisateur :
1. Mémoire projet persistante (rules, contraintes, décisions, refus).
2. Conscience de l'historique conversationnel complet sur le projet.
3. Méthode **interface-first** : crée d'abord une page visuelle (recommandations type Vinted, etc.) pour donner un cadre concret avant la logique.
4. Méthode **tableau de pilotage** : découpe le projet en catégories → étapes → sous-étapes, exécute une étape à la fois avec validation utilisateur entre chaque.
5. Reprise propre après interruption : si l'utilisateur pose une question pendant l'étape 3, Elena répond sans perdre la position dans le plan.

## Chantier 1 — Mémoire & contexte ✅
- [x] Historique conversation chargé dans le prompt (24 derniers messages).
- [x] Brief projet persistant injecté à chaque tour (nom, type, description, étape pilotage active).
- [x] Système mémoire `mem://` : table `project_memory` avec règles typées (core/design/constraint/preference/feature/reference), épinglage core, soft-delete.
- [x] Tools `memory_save` / `memory_list` / `memory_archive` exposés à Elena dans agent loop.
- [x] Auto-capture des refus utilisateur via prompt système (Elena sauvegarde dès qu'un refus/préférence/décision est exprimé).
- [x] Drawer mémoire 2 onglets dans /dev (Règles typées + Notes RAG long-format).

## Chantier 2 — Sandbox propre ✅
- [x] Isolation stricte par projet : `setProjectScope(projectId)` reset au template par défaut quand on ouvre un projet inconnu.
- [x] Auto-save debounced de l'état courant par projet (`localStorage` clé `nx:current:{projectId}`) → reprise auto au retour.
- [x] Persistance de l'état du projet précédent avant bascule (zéro perte).
- [x] Garde-fou prompt Elena : "fichiers du projet COURANT uniquement, jamais d'un autre projet".
- [ ] (futur) Snapshot DB côté Lovable Cloud pour multi-device (actuellement localStorage = mono-navigateur).

## Chantier 3 — Tableau de pilotage projet (UI dans /dev) ✅ v1
Onglet **"Pilotage"** ajouté dans `DevWorkspace` (4ème onglet à droite, après Aperçu / Code / Terminal).

Implémenté :
- [x] Composant `PilotPanel` (CRUD catégories + étapes, persistance Lovable Cloud).
- [x] Coût estimé éditable par catégorie ET par étape, badge `$X.XX` à côté du titre.
- [x] Coût total projet affiché dans le header.
- [x] Statut cyclable (todo → in_progress → done → todo) en cliquant sur l'icône.
- [x] Auto-déplie les catégories qui ont une étape `in_progress`.
- [x] Bouton "Copier prompt étape" → injecte un prompt structuré dans la zone de saisie du chat Elena.
- [x] Compteur d'étapes terminées par catégorie.

Encore à faire :
- [x] Sous-sous-liste fiches/composants par étape (table `pilot_items`).
- [x] Bouton "Lancer étape" → marque `in_progress` + injecte prompt autopilote dans le chat.
- [x] Remplissage auto via `/api/pilot-suggest` (Lovable AI Gateway, structured output).
- [x] Estimations de coûts auto-suggérées par étape (incluses dans le plan généré).
- [x] Outils `pilot_complete_step`, `pilot_start_next_step`, `pilot_add_item`, `pilot_check_item` exposés à Elena dans l'agent loop (chantier 6) — elle peut tenir le tableau à jour en temps réel pendant l'exécution.

## Chantier 4 — Méthode interface-first ✅
- [x] Règle ajoutée au prompt système d'Elena : sur sandbox vide / template par défaut → générer D'ABORD la page d'accueil avec blocs sectoriels (marketplace, blog, SaaS, dashboard…).
- [x] Annonce ensuite les prochaines étapes recommandées (1 phrase).
- [x] Skip la règle si la sandbox contient déjà du contenu réel du projet.

## Chantier 5 — Robustesse à l'interruption ✅
- [x] État "étape courante" persisté côté serveur (table `pilot_state` : `current_step_id`, `current_category_id`, `autopilot_enabled`).
- [x] `launchStep` du PilotPanel upsert l'état actif → reprise possible depuis n'importe quel device/session.
- [x] `fetchProjectBrief` charge l'étape active + catégorie, injecte « 🎯 Étape EN COURS » dans le system prompt d'Elena.
- [x] Règle prompt : si user pose une question annexe → réponse courte + « On reprend l'étape … Je continue. » + reprise réelle.
- [x] Garde-fou : changement de plan = annonce du diff + validation, jamais silencieux.

## Décisions arrêtées (avril 2026)
1. **Tableau par projet** : un tableau de pilotage indépendant créé/rempli pour chaque projet. Pas de template global réutilisable au démarrage.
2. **Source de vérité = DB Lovable Cloud** : tables `pilot_categories`, `pilot_steps`, `pilot_state`. Pas de `pilot.json` dans la sandbox (perdu si reset).
3. **Mode autopilote avec mini-synthèse** : Elena enchaîne les étapes en autonomie, fait une mini-synthèse à chaque étape terminée (`✅ Étape 1/6 : … → je passe à l'étape 2`), s'arrête uniquement sur :
   - Décision design/produit ambiguë (besoin d'un choix utilisateur)
   - Donnée manquante (catégories, contenu, intégration externe)
   - Risque de casse (suppression majeure, refonte)
   Pas besoin de "go" entre chaque étape (utilisateur n'a pas la contrainte crédits Lovable).
4. **Interruptions = réponse + reprise auto** : si user pose une question annexe, Elena répond brièvement puis enchaîne `On reprend l'étape 3/6 : [résumé court]. Je continue.` Aucun choix explicite à donner.
5. **Pas de mode batch explicite** ("go x3") — l'autopilote couvre déjà ce besoin.

## Ordre d'attaque suggéré
1. Chantier 1 (mémoire) — prérequis de tout le reste.
2. Chantier 2 (sandbox propre) — fix immédiat du bug "Hero sur app Vinted".
3. Chantier 3 (tableau de pilotage UI) — gros morceau, à découper lui-même en étapes.
4. Chantier 4 (interface-first) — règle dans le prompt système d'Elena, peu de code.
5. Chantier 5 (robustesse interruption) — couche au-dessus du tableau de pilotage.

---

## 2026-05-21 — Chantier "Elena édite comme un vrai dev"

**Problèmes corrigés :**
1. Elena bloquait au 2ème tour → cause = `write_file` géant à chaque modif.
2. Tous les sites se ressemblaient → cause = prompt forçait recherche dans le catalogue de blocs en premier.

**Changements :**
- `src/routes/api/elena-workspace.ts` : section "Tes outils workspace" réécrite avec règle dure `write_file` = nouveau fichier uniquement, `edit_file` = toute modif.
- Section "Bibliothèque de blocs (PRIORITÉ ABSOLUE)" remplacée par "Composition UI — shadcn d'abord, blocs en inspiration". shadcn devient brique de base ; blocs = inspiration optionnelle.
- `MAX_WORKSPACE_RUN_MS` : 180s → 90s. Force des tool-calls plus petits.

**À surveiller :** vérifier que `edit_file` est bien utilisé au 2ème tour et que les sites créés ont des compositions variées.

**Suite (non fait ici) :** OpenRouter + routage par modèle (vision Claude, code OpenAI, etc.).

## 2026-05-21 (suite) — Anti-uniformité

**Constat user (screenshots coach sportif + immo) :** les 2 sites partageaient la même structure (Hero badges + gradient titre, Méthode 4 cards, Pricing 1 col centrée, Avis 3 cards verticales). Cause = contradictions dans le prompt qui forçaient encore `list_templates`/`search_blocks` "EN PREMIER" malgré la règle shadcn-first.

**Fix :** descriptions des tools `search_blocks` + `list_templates` passées en OPTIONNEL. Section "Templates" et "Étape 2" du kickoff réécrites : Elena décide elle-même les sections (5-9), varie l'ordre, varie Hero/cards/grilles. Templates uniquement si demandé par user ou pattern métier obligatoire (booking, fiche bien).

## 2026-05-21 (suite 2) — Blocs désactivés par défaut au runtime

**Constat user (screenshot chat Elena) :** malgré le prompt "optionnel", Elena appelait encore `search_blocks` en premier sur un simple brief food truck. Donc le problème venait du fait que l'outil restait disponible et attirait le modèle.

**Fix dur :** `search_blocks`, `get_block`, `list_templates`, `get_template` ne sont plus injectés dans les outils disponibles par défaut. Ils ne sont exposés que si le dernier message utilisateur demande explicitement bloc/template/catalogue. Pour une création normale, Elena doit composer from scratch avec shadcn + tokens.

## 2026-06-07 — Gros projets importés : coaching anti-crash sandbox

**Constat user :** sur un projet Nexyra complet importé, Elena lançait `npm install`, `bun install`, puis plusieurs variantes jusqu'au crash mémoire `killed/code 137`, avant de conclure trop vaguement que le projet était “trop lourd”.

**Règle Elena :** pour un ZIP/projet complet importé, Elena doit utiliser `restart_preview` une seule fois. Le marqueur `.nexyra-readonly-import` veut seulement dire “projet importé” : il ne doit plus bloquer l'installation à lui seul. Si l'installation échoue vraiment (mode exploration, crash mémoire, killed/code 137), Elena arrête toute boucle npm/bun/pnpm/yarn, explique simplement que les fichiers sont bien importés/modifiables mais que la preview complète exige un environnement plus puissant, puis continue par une exploration utile (`ls`, `package.json`, fichiers clés) au lieu de poser une question vague.

**Correctif complémentaire :** même règle appliquée à l'ancien endpoint `/api/elena-e2b`, qui contenait encore une consigne dure “UTILISE LES BLOCS” + outils catalogue toujours exposés. Désormais les deux chemins Elena cachent les blocs sauf demande explicite.
