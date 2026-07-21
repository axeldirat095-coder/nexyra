-- Chantier 3 v2 : sous-fiches par étape (composants/écrans à traiter)
CREATE TABLE public.pilot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.pilot_steps(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  org_id uuid NOT NULL,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pilot_items_step ON public.pilot_items(step_id);
CREATE INDEX idx_pilot_items_project ON public.pilot_items(project_id);

ALTER TABLE public.pilot_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_pilot_items"
  ON public.pilot_items FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_insert_pilot_items"
  ON public.pilot_items FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_update_pilot_items"
  ON public.pilot_items FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "org_members_delete_pilot_items"
  ON public.pilot_items FOR DELETE TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE TRIGGER pilot_items_set_updated_at
  BEFORE UPDATE ON public.pilot_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();