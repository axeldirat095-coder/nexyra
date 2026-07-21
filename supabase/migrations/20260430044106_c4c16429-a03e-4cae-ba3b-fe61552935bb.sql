UPDATE public.capabilities
SET status = 'done', completed_at = now()
WHERE title = 'LOT P-5 — RAG sémantique pré-calculé sur project_docs';