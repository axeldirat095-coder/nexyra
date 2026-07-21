UPDATE public.capabilities
SET status = 'done', completed_at = now()
WHERE title IN (
  'LOT P-1 — Fast-Apply intelligent (line_replace vs rewrite)',
  'LOT P-6 — Streaming SSE vrai token-par-token'
);