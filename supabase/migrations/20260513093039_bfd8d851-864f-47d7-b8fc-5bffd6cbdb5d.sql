UPDATE public.pilot_steps
SET status = 'done', completed_at = now(), updated_at = now()
WHERE id = '595d7e83-9f08-44bf-963b-480fc587d2b3'
   OR title ILIKE '%Compaction historique%';