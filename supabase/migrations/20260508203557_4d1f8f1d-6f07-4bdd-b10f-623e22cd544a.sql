
UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 26** — Tool `luma_video` (text→video et image→video) via fal.ai luma-dream-machine. BYOK `fal_api_key` ou env FAL_KEY.' WHERE id='4bb942f6-24d6-4d80-ba30-46c6b032767a';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 26** — Veo 3 déjà câblé via le tool `video_veo` (LOT 9, fal.ai BYOK). Confirmé opérationnel.' WHERE id='8251a9ce-1c62-4686-a850-9be74ebc3523';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 26** — Apify déjà câblé via le tool `apify_run` (LOT 9, BYOK `apify_api_token`). Accès aux 3000+ actors Apify.' WHERE id='01168d9b-ec40-431f-b0b7-d6e8c6ead09d';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 26** — Tool `deepgram_transcribe` : Nova-3 multilingue, smart_format, diarization optionnelle. BYOK `deepgram_api_key`.' WHERE id='f3ea6e68-2efe-4b84-aa30-f5cdecd89c4c';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 26** — Tool `cloudconvert` : conversion universelle (MD/DOCX/PDF/HTML/images/audio/vidéo) via job multi-tâches CloudConvert. BYOK `cloudconvert_api_key`.' WHERE id='38418539-3968-45f9-b310-e4c3512bba23';
