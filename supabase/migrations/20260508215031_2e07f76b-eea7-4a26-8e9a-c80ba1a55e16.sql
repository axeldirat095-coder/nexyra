INSERT INTO public.capabilities (
  category_id, category_label, category_icon, title, info, status, priority, position, completed_at
)
SELECT
  'multimodal', '🎬 Multimodal', 'video',
  'Génération vidéo (fal.ai Veo3 / Kling / Luma)',
  'Tool video_generate dans Elena v2 + route /api/video-generate. Text-to-video et image-to-video, 5-10s, BYOK FAL_KEY (déjà serveur).',
  'done'::capability_status, 'P1'::capability_priority,
  COALESCE((SELECT MAX(position) FROM public.capabilities WHERE category_id = 'multimodal'), 0) + 1,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.capabilities
  WHERE category_id = 'multimodal' AND title = 'Génération vidéo (fal.ai Veo3 / Kling / Luma)'
);