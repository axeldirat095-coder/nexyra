UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'errorComponent + notFoundComponent en place : ErrorBoundary global dans __root.tsx (capture vers error_events via captureError), defaultErrorComponent + defaultNotFoundComponent dans router.tsx (UI premium avec retry + retour accueil). Plus jamais de page blanche.'
WHERE category_id = 'quality'
  AND title ILIKE '%erreurs globale%';

UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Hook useDraft (src/hooks/useDraft.ts) : auto-save localStorage avec debounce 500ms, restauration au mount, clear après envoi. Branché sur l''input chat Elena (clé scopée par projet) et le ScrapePanel. Anti-perte zéro friction, zéro dépendance.'
WHERE category_id = 'quality'
  AND title ILIKE '%Auto-save%';