-- 1. Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ajouter la colonne embedding sur project_docs (1536 dims = text-embedding-3-small)
ALTER TABLE public.project_docs
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- 3. Index IVFFlat pour recherche rapide en cosinus
CREATE INDEX IF NOT EXISTS project_docs_embedding_idx
  ON public.project_docs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. Fonction de recherche sémantique (security invoker => respecte RLS)
CREATE OR REPLACE FUNCTION public.match_project_docs(
  _project_id uuid,
  _query_embedding vector(1536),
  _match_count integer DEFAULT 5,
  _min_similarity real DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  tags text[],
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.title,
    d.content,
    d.tags,
    (1 - (d.embedding <=> _query_embedding))::real AS similarity
  FROM public.project_docs d
  WHERE d.project_id = _project_id
    AND d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> _query_embedding)) >= _min_similarity
  ORDER BY d.embedding <=> _query_embedding
  LIMIT _match_count;
$$;

-- 5. Marquer la capability comme done
UPDATE public.capabilities
   SET status = 'done',
       completed_at = now(),
       info = 'Livré : extension pgvector + colonne embedding(1536) sur project_docs + index IVFFlat cosinus + fonction match_project_docs(security invoker, respecte RLS). Embeddings générés via OpenAI text-embedding-3-small au moment où la note est créée/modifiée. elena-chat utilise désormais la recherche sémantique en priorité, fallback sur FTS si pas d''embedding.'
 WHERE title = 'RAG vectoriel (pgvector + embeddings)';