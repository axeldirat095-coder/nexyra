UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Coloration syntaxique Prism (oneDark) sur tous les blocs de code Elena. Détection automatique du langage via la fenced markdown (```ts, ```tsx, ```sql…). Composant CodeBlock partagé.'
WHERE category_id = 'code-sandbox'
  AND title ILIKE '%coloration syntaxique%';

UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Toolbar sur chaque bloc de code Elena : bouton Copier (clipboard + toast confirmation) et bouton Appliquer (callback onApply prêt pour l''éditeur de l''Étape 3). Inline code stylé séparément.'
WHERE category_id = 'code-sandbox'
  AND title ILIKE '%copier%';