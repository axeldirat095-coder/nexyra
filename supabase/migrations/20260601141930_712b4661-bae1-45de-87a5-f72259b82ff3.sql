UPDATE public.capabilities
SET status = 'done', updated_at = now()
WHERE title = 'Lot C — Streaming SSE temps réel agent' AND status = 'todo';