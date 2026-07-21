-- Type énum pour la nature des règles
CREATE TYPE public.memory_kind AS ENUM ('core', 'design', 'constraint', 'preference', 'feature', 'reference');

CREATE TABLE public.project_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  org_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  kind public.memory_kind NOT NULL DEFAULT 'preference',
  title text NOT NULL,
  body text NOT NULL,
  source text NOT NULL DEFAULT 'manual', -- 'user' | 'agent_auto' | 'manual'
  is_pinned boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_memory_project ON public.project_memory (project_id) WHERE archived_at IS NULL;
CREATE INDEX idx_project_memory_kind ON public.project_memory (project_id, kind) WHERE archived_at IS NULL;

ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_memory"
  ON public.project_memory FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_insert_memory"
  ON public.project_memory FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_update_memory"
  ON public.project_memory FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_delete_memory"
  ON public.project_memory FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER trg_project_memory_updated_at
  BEFORE UPDATE ON public.project_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();