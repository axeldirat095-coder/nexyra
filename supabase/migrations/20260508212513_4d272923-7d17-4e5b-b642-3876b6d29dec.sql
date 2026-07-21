CREATE TABLE IF NOT EXISTS public.image_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  tags text[] DEFAULT '{}',
  source text,
  embedding extensions.vector(512),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_memory_owner ON public.image_memory(owner_id);
CREATE INDEX IF NOT EXISTS idx_image_memory_project ON public.image_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_image_memory_embedding
  ON public.image_memory USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 50);

ALTER TABLE public.image_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own image memory" ON public.image_memory;
DROP POLICY IF EXISTS "Users insert own image memory" ON public.image_memory;
DROP POLICY IF EXISTS "Users update own image memory" ON public.image_memory;
DROP POLICY IF EXISTS "Users delete own image memory" ON public.image_memory;
CREATE POLICY "Users see own image memory" ON public.image_memory FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users insert own image memory" ON public.image_memory FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users update own image memory" ON public.image_memory FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users delete own image memory" ON public.image_memory FOR DELETE USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.match_image_memory(
  _query extensions.vector,
  _match_count integer DEFAULT 5,
  _project_id uuid DEFAULT NULL,
  _min_similarity real DEFAULT 0.2
)
RETURNS TABLE(id uuid, image_url text, caption text, tags text[], project_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.image_url, m.caption, m.tags, m.project_id,
         (1 - (m.embedding OPERATOR(extensions.<=>) _query))::real AS similarity
    FROM public.image_memory m
   WHERE m.owner_id = auth.uid()
     AND m.embedding IS NOT NULL
     AND (_project_id IS NULL OR m.project_id = _project_id)
     AND (1 - (m.embedding OPERATOR(extensions.<=>) _query)) >= _min_similarity
   ORDER BY m.embedding OPERATOR(extensions.<=>) _query
   LIMIT _match_count;
$$;

UPDATE public.capabilities
   SET status = 'done'::capability_status,
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE id IN (
   '00bd3c68-1653-482a-92af-ed3e07ba9c03',
   '37d06205-e309-4c5b-9a92-38fab5b07025',
   '1851aa86-47f7-45c4-a045-6b80ed04076e'
 );