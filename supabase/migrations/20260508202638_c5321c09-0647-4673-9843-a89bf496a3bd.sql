
ALTER TYPE public.ai_provider ADD VALUE IF NOT EXISTS 'xai';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 24** — DeepSeek et Anthropic sont déjà câblés dans `ai-providers.server.ts` (cascade `callWithFallback`). Clés BYOK lues via `external_keys` (`deepseek` / `anthropic`).' WHERE id='10438e58-3a22-4138-b512-e52b577a47ae';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 24** — xAI Grok-4 (modèle `grok-4`, endpoint OpenAI-compat `https://api.x.ai/v1`) ajouté à la cascade. BYOK via clé `xai` dans `external_keys`.' WHERE id='5127610c-ab97-4e3c-991b-754d79d09467';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 24** — Tool `screenshot_capture` (BYOK `screenshotone_access_key`) : capture URL → image PNG/JPG full-page, retourne dataUrl + sauvegarde optionnelle dans le VFS.' WHERE id='4d3bb18d-57cc-4ed4-bcc1-5a4b339592d7';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 24** — Tool `image_remove_bg` (BYOK Remove.bg `removebg_api_key` prioritaire, fallback ClipDrop `clipdrop_api_key`). Retourne PNG transparent dataUrl + écrit dans VFS si `target_path`.' WHERE id='bf784be7-008c-4a13-98b7-70fbe3076475';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 24** — Tool `image_upscale` via fal.ai `clarity-upscaler` (BYOK `fal_api_key` ou `FAL_KEY` env), facteur 2x/4x. Pour 16x, exécution séquentielle 4x→4x.' WHERE id='ec705424-7632-47a3-bc9e-892861a19b9d';
