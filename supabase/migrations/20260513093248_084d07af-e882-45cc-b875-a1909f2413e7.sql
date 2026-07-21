UPDATE public.pilot_steps
SET status = 'done', completed_at = now(), updated_at = now()
WHERE title ILIKE '%Streaming token-by-token%';