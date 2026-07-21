UPDATE public.pilot_steps
SET status = 'done', completed_at = now(), updated_at = now()
WHERE title ILIKE '%Reprise auto%crash%';
UPDATE public.pilot_categories
SET status = 'done', updated_at = now()
WHERE title ILIKE '%Stabilité%Performance%moteur%'
  AND NOT EXISTS (
    SELECT 1 FROM public.pilot_steps s
    WHERE s.category_id = pilot_categories.id AND s.status <> 'done'
  );