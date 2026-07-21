CREATE TABLE public.e2b_sandboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  sandbox_id text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  preview_url text,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, project_id)
);

ALTER TABLE public.e2b_sandboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own sandboxes" ON public.e2b_sandboxes
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users insert own sandboxes" ON public.e2b_sandboxes
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users update own sandboxes" ON public.e2b_sandboxes
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users delete own sandboxes" ON public.e2b_sandboxes
  FOR DELETE USING (auth.uid() = owner_id);

CREATE INDEX idx_e2b_sandboxes_owner_project ON public.e2b_sandboxes(owner_id, project_id);
CREATE INDEX idx_e2b_sandboxes_last_active ON public.e2b_sandboxes(last_active_at);