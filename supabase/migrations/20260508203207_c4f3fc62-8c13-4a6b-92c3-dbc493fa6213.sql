
UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 25** — Tool `auth_configure` : scaffold complet `/auth` (Google OAuth + magic link), `useAuth` hook, `ProtectedRoute`. Idempotent.' WHERE id='fcf0b323-0c39-49f8-8c72-203035d24e0e';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 25** — Tool `edge_function_deploy` : génère `supabase/functions/<name>/index.ts` (squelette CORS + JSON) + patch `config.toml` si `verify_jwt=false`. Déploiement auto par Lovable Cloud.' WHERE id='2c06a482-d622-4113-935f-a766e5fc8081';

UPDATE public.capabilities SET status='done', completed_at=now(), info=COALESCE(info,'') || E'\n\n**LOT 25** — Tool `cartesia_tts` : Cartesia Sonic-2 (BYOK `cartesia_api_key`), latence ~75ms, voix multilingue. Retourne mp3 dataUrl.' WHERE id='fcb6d4fc-11f8-4722-b3ca-1b6d42a9e606';
