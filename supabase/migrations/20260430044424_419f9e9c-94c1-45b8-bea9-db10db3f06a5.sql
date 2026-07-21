UPDATE public.capabilities
SET status = 'done', updated_at = now()
WHERE title ILIKE '%P-3%' OR title ILIKE '%P-7%'
   OR title ILIKE '%speculative%' OR title ILIKE '%pre-warm%' OR title ILIKE '%prewarm%';