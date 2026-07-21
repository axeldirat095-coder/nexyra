
-- Fix 1: audit_logs SELECT policy - allow users to see their own null-org rows
DROP POLICY IF EXISTS audit_org_members_select ON public.audit_logs;
CREATE POLICY audit_org_members_select ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Fix 2: integration_secrets - prevent client reads of encrypted_value
DROP POLICY IF EXISTS "Owner sees own integration secret rows" ON public.integration_secrets;

-- Safe metadata view (no encrypted_value)
CREATE OR REPLACE VIEW public.integration_secrets_meta
WITH (security_invoker = true) AS
SELECT id, integration_id, owner_id, kind, expires_at, rotated_at, created_at, updated_at
FROM public.integration_secrets
WHERE owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role);

GRANT SELECT ON public.integration_secrets_meta TO authenticated;

-- Revoke client SELECT access on the underlying table (service_role and SECURITY DEFINER functions still work)
REVOKE SELECT ON public.integration_secrets FROM authenticated, anon;
