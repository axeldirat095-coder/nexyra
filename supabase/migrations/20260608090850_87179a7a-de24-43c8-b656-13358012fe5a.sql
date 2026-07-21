-- 1. Restrict capabilities SELECT to admins only
DROP POLICY IF EXISTS authenticated_read_capabilities ON public.capabilities;
CREATE POLICY "Admins can read capabilities"
  ON public.capabilities
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Scope project_quotas owner SELECT policy to authenticated role
DROP POLICY IF EXISTS "Project owners can view their quota" ON public.project_quotas;
CREATE POLICY "Project owners can view their quota"
  ON public.project_quotas
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_quotas.project_id AND p.owner_id = auth.uid()
  ));