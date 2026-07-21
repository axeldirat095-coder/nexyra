---
name: Elena edit doctrine — edit_file par défaut + shadcn-first + budget 90s
description: Doctrine appliquée au system prompt Elena (mai 2026) — fix du blocage au 2ème tour et de l'uniformité visuelle
type: feature
---

## Cause racine identifiée (mai 2026)

1. **Blocage au 2ème tour** : Elena faisait `write_file` du fichier complet à chaque modif. Au 2ème tour, fichier ~500 lignes → génération >90s → timeout → spinner infini.
2. **Tous les sites se ressemblent** : le prompt forçait à piocher dans le catalogue de blocs (~15 variantes finies) en premier.

## Règles appliquées (`src/server/elena-prompts.server.ts` + `src/routes/api/elena-workspace.ts`)

### Outils fichiers (règle dure)
- Fichier inexistant → `write_file`.
- Fichier existant → **TOUJOURS** `edit_file` (search-replace chirurgical). Plusieurs zones = plusieurs `edit_file`.
- `write_file` sur un fichier existant = interdit (sauf refonte totale demandée explicitement par l'user).

### Composition UI (shadcn-first)
- Brique de base = composants `@/components/ui/*` (~50 dispo : button, card, dialog, tabs, accordion, carousel, sheet, form, etc.).
- Composition libre avec shadcn + Tailwind v4 + tokens sémantiques `@theme` en oklch.
- Catalogue de blocs/templates : **interdit par défaut**, débloqué uniquement si l'user demande explicitement "bloc / template / catalogue / bibliothèque".

### Budget
- Timeout par run LLM : **90s** (avant 180s) dans `MAX_WORKSPACE_RUN_MS`. Si Elena dépasse → on coupe, elle découpe plus fin au tour suivant.

## Comment tester
- `/dev` → "Crée-moi une landing pour un coach sportif".
- Vérifier : (a) elle compose avec shadcn, pas que des blocs, (b) au 2ème tour ("change le titre du hero + ajoute un bouton WhatsApp") elle utilise `edit_file`, (c) pas de spinner infini.
