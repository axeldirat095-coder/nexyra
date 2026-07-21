-- Snapshots des fichiers de la sandbox E2B (Save manuel /dev2)
CREATE TABLE public.sandbox_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  project_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Sauvegarde',
  files JSONB NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sandbox_snapshots_owner_project
  ON public.sandbox_snapshots (owner_id, project_key, created_at DESC);

ALTER TABLE public.sandbox_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view sandbox snapshots"
ON public.sandbox_snapshots FOR SELECT
USING (auth.uid() = owner_id);

CREATE POLICY "Owner can create sandbox snapshots"
ON public.sandbox_snapshots FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can delete sandbox snapshots"
ON public.sandbox_snapshots FOR DELETE
USING (auth.uid() = owner_id);