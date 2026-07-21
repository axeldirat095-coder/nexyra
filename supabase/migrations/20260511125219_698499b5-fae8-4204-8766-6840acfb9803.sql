CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.llm_cache
  ADD COLUMN IF NOT EXISTS prompt_text text,
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536),
  ADD COLUMN IF NOT EXISTS semantic_hits integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_llm_cache_embedding
  ON public.llm_cache USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.match_llm_cache(
  query_embedding extensions.vector(1536),
  match_model text,
  match_threshold float DEFAULT 0.95,
  match_count int DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  response_text text,
  tokens_input int,
  tokens_output int,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id, response_text, tokens_input, tokens_output,
         1 - (embedding <=> query_embedding) AS similarity
  FROM public.llm_cache
  WHERE embedding IS NOT NULL
    AND model = match_model
    AND 1 - (embedding <=> query_embedding) >= match_threshold
  ORDER BY embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

UPDATE public.capabilities
SET status = 'in_progress', started_at = now()
WHERE id = '0f17d600-36ba-4ece-b179-308eea6e2874';