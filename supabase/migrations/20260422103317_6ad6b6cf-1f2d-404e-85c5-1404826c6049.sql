-- Ajout du provider IA par défaut pour l'agent Elena (BYOK)
ALTER TABLE public.elena_settings
  ADD COLUMN IF NOT EXISTS agent_provider public.ai_provider NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS agent_model text NOT NULL DEFAULT 'gpt-5-mini';