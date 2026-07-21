UPDATE public.pilot_steps SET status = 'done', completed_at = now()
WHERE title IN (
  'Build verify automatique après chaque génération',
  'Lint auto-fix sur fichiers générés',
  'Tool dependency_scan (sécurité npm)',
  'Tool secrets_add (vault Lovable Cloud)'
) AND status = 'todo';

UPDATE public.pilot_categories SET status = 'done', updated_at = now()
WHERE title = '🛠️ Outillage agent (parité Lovable)'
  AND NOT EXISTS (
    SELECT 1 FROM public.pilot_steps s
    WHERE s.category_id = pilot_categories.id AND s.status <> 'done'
  );