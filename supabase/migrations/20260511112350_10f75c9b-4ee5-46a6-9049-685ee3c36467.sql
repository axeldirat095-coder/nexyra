
CREATE TABLE public.llm_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  task_type text NOT NULL,
  model text NOT NULL,
  response_text text NOT NULL,
  tokens_input integer DEFAULT 0,
  tokens_output integer DEFAULT 0,
  hits integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_cache_key ON public.llm_cache(cache_key);
CREATE INDEX idx_llm_cache_last_used ON public.llm_cache(last_used_at DESC);

ALTER TABLE public.llm_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llm_cache_public_read"
ON public.llm_cache FOR SELECT
TO anon, authenticated
USING (true);
