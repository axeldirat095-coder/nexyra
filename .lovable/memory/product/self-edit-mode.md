---
name: Mode Self-Edit (sortie de Lovable)
description: Roadmap pour qu'Elena puisse modifier Nexyra elle-même, en vue d'une sortie de Lovable
type: feature
---

# Mode Self-Edit — autonomie vis-à-vis de Lovable

But : permettre à l'utilisateur de sortir de Lovable à terme. Elena doit pouvoir modifier l'app Nexyra elle-même (pas juste créer d'autres projets).

## Décision (juin 2026)
NE PAS lancer maintenant. Garder Lovable tant que Nexyra n'est pas stable + monétisé. Préparer en parallèle.

## Roadmap en 3 étapes
- **A. Self-Edit basique** : Elena clone le repo Nexyra depuis GitHub, fait modifs UI simples (couleur, texte, bouton), push sur un branch, user valide.
- **B. Self-Edit Pro** : Elena peut créer une page, modifier le cerveau, ajouter une fonctionnalité.
- **C. Exit Lovable** : déploiement autonome (Cloudflare/Vercel + Supabase direct), Lovable hors boucle.

## Prérequis techniques
- Import projet depuis repo GitHub complet (déjà partiellement via `ImportProjectDialog.tsx` + `/api/import-project.ts`)
- Sandbox E2B capable de cloner un repo et pousser des commits
- Workflow PR/branch pour que l'user valide avant merge sur main
