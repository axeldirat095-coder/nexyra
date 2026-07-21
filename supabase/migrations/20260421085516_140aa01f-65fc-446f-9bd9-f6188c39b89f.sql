-- Cache des réponses IA
CREATE TABLE public.prompt_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT NOT NULL,
  tokens_saved INTEGER NOT NULL DEFAULT 0,
  cost_saved_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_hit_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (prompt_hash, model)
);

CREATE INDEX idx_prompt_cache_lookup ON public.prompt_cache (prompt_hash, model, expires_at);
CREATE INDEX idx_prompt_cache_expires ON public.prompt_cache (expires_at);

ALTER TABLE public.prompt_cache ENABLE ROW LEVEL SECURITY;

-- Lecture pour utilisateurs connectés (cache mutualisé)
CREATE POLICY "auth_select_cache" ON public.prompt_cache
  FOR SELECT TO authenticated
  USING (true);

-- Pas de policy INSERT/UPDATE/DELETE → seul service_role peut écrire

-- Fonction atomique : check + increment hit
CREATE OR REPLACE FUNCTION public.get_or_increment_cache(_hash TEXT, _model TEXT)
RETURNS TABLE(response TEXT, tokens_saved INTEGER, cost_saved_usd NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.prompt_cache
     SET hits = hits + 1,
         last_hit_at = now()
   WHERE prompt_hash = _hash
     AND model = _model
     AND expires_at > now()
  RETURNING prompt_cache.response, prompt_cache.tokens_saved, prompt_cache.cost_saved_usd;
END;
$$;

-- Purge des entrées expirées
CREATE OR REPLACE FUNCTION public.purge_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INTEGER;
BEGIN
  DELETE FROM public.prompt_cache WHERE expires_at < now();
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- Stats cache pour l'admin
CREATE OR REPLACE FUNCTION public.get_cache_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'entries', count(*),
    'total_hits', COALESCE(sum(hits), 0),
    'total_cost_saved', COALESCE(sum(cost_saved_usd * hits), 0),
    'total_tokens_saved', COALESCE(sum(tokens_saved * hits), 0)
  ) INTO _result
  FROM public.prompt_cache
  WHERE expires_at > now();

  RETURN _result;
END;
$$;

-- Suivi du résumé auto sur les conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS messages_since_summary INTEGER NOT NULL DEFAULT 0;