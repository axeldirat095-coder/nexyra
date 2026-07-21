-- Add fallback prefs to elena_settings
ALTER TABLE public.elena_settings
  ADD COLUMN IF NOT EXISTS fallback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fallback_chain text[] NOT NULL DEFAULT ARRAY['openai','anthropic','google']::text[];

-- Mark capability as done
UPDATE public.capabilities
SET status = 'done',
    info = 'Bascule automatique entre providers : si OpenAI échoue (401/429/5xx), Elena retombe sur Anthropic puis Google selon la chaîne configurée par l''utilisateur. Activable/désactivable dans Paramètres → Clés API. Chaque bascule est tracée dans audit_logs.',
    completed_at = now(),
    updated_at = now()
WHERE title ILIKE '%fallback%';