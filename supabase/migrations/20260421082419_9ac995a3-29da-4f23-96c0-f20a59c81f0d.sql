
CREATE TABLE public.project_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Note',
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_docs_project ON public.project_docs(project_id);
CREATE INDEX idx_project_docs_fts ON public.project_docs USING GIN (to_tsvector('french', coalesce(title,'') || ' ' || coalesce(content,'')));

ALTER TABLE public.project_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_docs" ON public.project_docs
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_insert_docs" ON public.project_docs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND owner_id = auth.uid());

CREATE POLICY "org_members_update_docs" ON public.project_docs
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_delete_docs" ON public.project_docs
  FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER trg_project_docs_updated_at
  BEFORE UPDATE ON public.project_docs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
