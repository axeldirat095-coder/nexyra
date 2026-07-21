UPDATE public.capabilities
SET status = 'done', completed_at = now()
WHERE category_id = 'agent'
  AND (
    title ILIKE '%tool calling%'
    OR title ILIKE '%agent loop%'
    OR title ILIKE '%boucle%agent%'
    OR title ILIKE '%sandbox%bridge%'
    OR title ILIKE '%pont%sandbox%'
    OR title ILIKE '%file manipulation%'
    OR title ILIKE '%manipulation%fichier%'
  );