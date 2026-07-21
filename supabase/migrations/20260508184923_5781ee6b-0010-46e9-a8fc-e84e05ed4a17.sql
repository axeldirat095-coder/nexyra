INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority)
SELECT v.category_id, v.category_label, v.category_icon, v.title, v.info, v.status::capability_status, v.priority::capability_priority
FROM (VALUES
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'OCR Mistral', 'Outil ocr_extract : OCR PDF/image via Mistral OCR (BYOK mistral_api_key), markdown structuré.', 'done', 'P1'),
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'Ideogram 3.0 texte-image', 'Outil image_text : génération image avec typo lisible via Ideogram 3.0 (BYOK ideogram_api_key).', 'done', 'P1'),
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'Apify scrapers', 'Outil apify_run : exécute n''importe quel Actor Apify (Google Maps, Insta, LinkedIn…). BYOK apify_api_token.', 'done', 'P1'),
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'Veo 3 vidéo', 'Outil video_veo : génération vidéo 8s + audio Veo 3 via fal.ai (BYOK fal_api_key).', 'done', 'P1'),
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'Cohere reranker', 'Outil cohere_rerank : reranking sémantique post-RAG/search via Cohere v3.5 (BYOK cohere_api_key).', 'done', 'P1'),
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'Lighthouse audit', 'Outil lighthouse_audit : audit perf/A11y/SEO via Google PageSpeed Insights (clé optionnelle).', 'done', 'P1'),
  ('lot9', 'LOT 9 — Contenu, qualité, scraping', 'sparkles', 'Sentry capture', 'Outil sentry_capture : envoie events/messages dans Sentry (BYOK sentry_dsn).', 'done', 'P1')
) AS v(category_id, category_label, category_icon, title, info, status, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.capabilities c WHERE c.category_id = v.category_id AND c.title = v.title
);