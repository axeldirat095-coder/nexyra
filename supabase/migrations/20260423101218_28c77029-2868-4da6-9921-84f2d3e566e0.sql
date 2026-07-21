-- Enums
CREATE TYPE public.pilot_status AS ENUM ('todo', 'in_progress', 'done', 'blocked');

-- pilot_categories : grandes briques projet
CREATE TABLE public.pilot_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  org_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  icon text,
  position integer NOT NULL DEFAULT 0,
  status public.pilot_status NOT NULL DEFAULT 'todo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pilot_categories_project ON public.pilot_categories(project_id, position);

ALTER TABLE public.pilot_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_pilot_cats" ON public.pilot_categories
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_insert_pilot_cats" ON public.pilot_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND owner_id = auth.uid());

CREATE POLICY "org_members_update_pilot_cats" ON public.pilot_categories
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_delete_pilot_cats" ON public.pilot_categories
  FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER set_pilot_categories_updated_at
  BEFORE UPDATE ON public.pilot_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pilot_steps : sous-étapes d'une catégorie
CREATE TABLE public.pilot_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.pilot_categories(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  org_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  summary text,
  position integer NOT NULL DEFAULT 0,
  status public.pilot_status NOT NULL DEFAULT 'todo',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pilot_steps_category ON public.pilot_steps(category_id, position);
CREATE INDEX idx_pilot_steps_project ON public.pilot_steps(project_id, status);

ALTER TABLE public.pilot_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_pilot_steps" ON public.pilot_steps
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_insert_pilot_steps" ON public.pilot_steps
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_update_pilot_steps" ON public.pilot_steps
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_delete_pilot_steps" ON public.pilot_steps
  FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER set_pilot_steps_updated_at
  BEFORE UPDATE ON public.pilot_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pilot_state : étape en cours pour la reprise auto après interruption
CREATE TABLE public.pilot_state (
  project_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  current_step_id uuid REFERENCES public.pilot_steps(id) ON DELETE SET NULL,
  current_category_id uuid REFERENCES public.pilot_categories(id) ON DELETE SET NULL,
  autopilot_enabled boolean NOT NULL DEFAULT true,
  last_action text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pilot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_pilot_state" ON public.pilot_state
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_insert_pilot_state" ON public.pilot_state
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_update_pilot_state" ON public.pilot_state
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_delete_pilot_state" ON public.pilot_state
  FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER set_pilot_state_updated_at
  BEFORE UPDATE ON public.pilot_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();