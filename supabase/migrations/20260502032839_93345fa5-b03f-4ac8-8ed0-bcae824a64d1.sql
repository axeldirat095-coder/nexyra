-- Table de sauvegarde live de l'état sandbox (une ligne par projet, upsert)
CREATE TABLE public.project_sandbox_state (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  mode TEXT NOT NULL DEFAULT 'react',
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_path TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sandbox_state_owner ON public.project_sandbox_state(owner_id);

ALTER TABLE public.project_sandbox_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_sandbox_state" ON public.project_sandbox_state
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "owner_insert_sandbox_state" ON public.project_sandbox_state
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_update_sandbox_state" ON public.project_sandbox_state
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "owner_delete_sandbox_state" ON public.project_sandbox_state
  FOR DELETE TO authenticated USING (owner_id = auth.uid());