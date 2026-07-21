UPDATE public.capabilities SET category_id = 'elena-v2' WHERE category_id = 'elena-v3';

UPDATE public.capabilities
SET
  category_label = 'Elena 2.0 — Agent multimodal & multi-providers',
  category_icon  = 'Sparkles',
  category_vision = 'Faire d''Elena un véritable agent niveau Lovable+ : intent compris, projet structuré, visuels fiables, plan tenu de bout en bout, plus 80+ outils greffés (IA, voix, vidéo, doc, web, deploy) via providers BYOK.'
WHERE category_id = 'elena-v2';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    ORDER BY
      CASE status::text
        WHEN 'in_progress' THEN 0
        WHEN 'todo' THEN 1
        WHEN 'done' THEN 3
        ELSE 2
      END,
      priority,
      created_at
  ) - 1 AS new_pos
  FROM public.capabilities
  WHERE category_id = 'elena-v2'
)
UPDATE public.capabilities c
SET position = r.new_pos
FROM ranked r
WHERE c.id = r.id;