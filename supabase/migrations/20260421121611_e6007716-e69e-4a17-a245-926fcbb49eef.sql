UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Vitest + jsdom + @testing-library configurés (vitest.config.ts, src/test/setup.ts). Suite initiale : useDraft (5 tests : restauration, debounce, clear, suppression) + cn util (4 tests). 9/9 passent. Scripts npm : test, test:watch. Playwright (E2E) reporté volontairement — pas de surcoût tant que les parcours critiques ne sont pas figés.'
WHERE category_id = 'quality'
  AND title ILIKE '%Tests automatis%';