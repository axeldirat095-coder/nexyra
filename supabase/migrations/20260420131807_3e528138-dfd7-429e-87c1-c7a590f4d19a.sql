
-- 1) Buckets privés
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-assets', 'project-assets', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-snapshots', 'project-snapshots', false)
ON CONFLICT (id) DO NOTHING;

-- 2) RLS storage.objects pour project-assets (dossier = auth.uid())
CREATE POLICY "assets_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "assets_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "assets_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "assets_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3) RLS storage.objects pour project-snapshots
CREATE POLICY "snapshots_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-snapshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "snapshots_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-snapshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "snapshots_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-snapshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4) Table project_snapshots
CREATE TABLE public.project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Snapshot',
  version INTEGER NOT NULL DEFAULT 1,
  summary TEXT,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  messages_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_project ON public.project_snapshots(project_id, created_at DESC);
CREATE INDEX idx_snapshots_owner ON public.project_snapshots(owner_id);

ALTER TABLE public.project_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_snapshots"
  ON public.project_snapshots FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner_insert_snapshots"
  ON public.project_snapshots FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_delete_snapshots"
  ON public.project_snapshots FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
