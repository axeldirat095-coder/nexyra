---
name: Elena boucle visuelle — auto-critique sans référence (Lot 4)
description: Elena capture son propre rendu après chaque création, le critique vs son intention déclarée, et corrige avant de livrer
type: feature
---

## Pourquoi (killer feature Nexyra)

Lovable livre du code, Elena livre du code **qu'elle a vérifié visuellement**. Sur une création sans image de référence, elle ne s'arrête plus à "preview affichée OK" — elle compare ce qu'elle a livré à son intention.

## Mécanique

Nouveau tool `qa_self_render` dans `/api/elena-e2b` :
- Input : `user_request`, `intent_summary` (palette/typo/sections annoncées), `rendered_image_base64` (capture preview).
- Output : verdict **OK / FIX** + critique (hiérarchie, palette, densité, images vraies vs placeholder, sections, détails premium).
- Modèle : `gpt-5.2` vision (fallback Claude à brancher plus tard via `getUserAnthropicKey`).

## Workflow imposé (system prompt elena-e2b)

Step 5 du workflow création :
1. `capture_current_preview` (1×).
2. `qa_self_render` (verdict OK → réponse ; FIX → 1-3 `edit_file` chirurgicaux).
3. Si FIX → re-capture + re-qa **UNE seule fois**.
4. Après 2 cycles QA max → réponse quoi qu'il arrive. Pas de 3ᵉ tour.

Budget total relevé à 14 tool calls / réponse (max 2 captures, 2 qa_reference_render, 2 qa_self_render).

## Garde-fous

- Verdict OK sur Lovable-quality → pas de boucle inutile.
- `qa_self_render` est **séparé** de `qa_reference_render` : ce dernier reste utilisé uniquement avec image utilisateur jointe.
- Si capture vide → on saute le QA (anti-blocage).

## Comment tester

`/dev3` → "Crée-moi une landing pour un coach mental, palette douce".
Vérifier dans le chat qu'on voit la séquence : `image_generate` → `write_file` → `capture_current_preview` → `qa_self_render` (verdict OK ou FIX → corrections → re-capture). Au pire 2 cycles.
