-- Chantier 5 : état "étape courante" persisté côté serveur
CREATE TABLE IF NOT EXISTS public.pilot_state (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  active_step_id UUID REFERENCES public.pilot_steps(id) ON DELETE SET NULL,
  active_category_id UUID REFERENCES public.pilot_categories(id) ON DELETE SET NULL,
  autopilot_enabled BOOLEAN NOT NULL DEFAULT true,
  last_resumed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pilot_state ENABLE ROW LEVEL SECURITY;

-- L'utilisateur a accès au pilot_state si il est owner du projet (ou admin)
CREATE POLICY "pilot_state owner read"
ON public.pilot_state FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pilot_state.project_id
      AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "pilot_state owner upsert"
ON public.pilot_state FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pilot_state.project_id
      AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "pilot_state owner update"
ON public.pilot_state FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pilot_state.project_id
      AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "pilot_state owner delete"
ON public.pilot_state FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pilot_state.project_id
      AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE TRIGGER pilot_state_updated_at
BEFORE UPDATE ON public.pilot_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();