CREATE TYPE public.idea_status AS ENUM ('pending','accepted','rejected');

CREATE TABLE public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  title text NOT NULL,
  source text,
  status public.idea_status NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_ideas_project ON public.ideas (project_id, created_at DESC);
CREATE INDEX idx_ideas_owner ON public.ideas (owner_id, created_at DESC);

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ideas_org_select ON public.ideas
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY ideas_owner_insert ON public.ideas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND owner_id = auth.uid());

CREATE POLICY ideas_owner_update ON public.ideas
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY ideas_owner_delete ON public.ideas
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER trg_ideas_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();