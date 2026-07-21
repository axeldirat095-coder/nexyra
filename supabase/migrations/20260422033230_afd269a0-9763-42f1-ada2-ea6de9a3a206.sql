UPDATE public.capabilities
SET status = 'done', completed_at = now()
WHERE title IN (
  'Planificateur (décompose une demande en sous-tâches)',
  'Validation humaine avant action destructive'
);