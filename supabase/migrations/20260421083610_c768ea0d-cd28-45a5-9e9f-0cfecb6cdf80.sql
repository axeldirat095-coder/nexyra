-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_org ON public.audit_logs (org_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs (user_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_org_members_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY audit_self_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY audit_admin_delete ON public.audit_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ERROR EVENTS
CREATE TABLE public.error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  org_id uuid,
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL DEFAULT 'client',
  message text NOT NULL,
  stack text,
  route text,
  user_agent text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_error_events_created_at ON public.error_events (created_at DESC);
CREATE INDEX idx_error_events_unresolved ON public.error_events (resolved, created_at DESC);

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY errors_admin_select ON public.error_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY errors_public_insert ON public.error_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY errors_admin_update ON public.error_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY errors_admin_delete ON public.error_events
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));