
-- 1) Revoke column-level SELECT on encrypted/sensitive columns from authenticated
REVOKE SELECT (encrypted_key) ON public.api_keys FROM authenticated;
REVOKE SELECT (encrypted_value) ON public.external_keys FROM authenticated;
REVOKE SELECT (access_token_encrypted) ON public.github_connections FROM authenticated;
REVOKE SELECT (encrypted_value) ON public.integration_secrets FROM authenticated;
REVOKE SELECT (encrypted_token) ON public.project_mcp_tokens FROM authenticated;
REVOKE SELECT (encrypted_auth_token) ON public.webhook_custom_tools FROM authenticated;

-- Also revoke from anon defensively
REVOKE SELECT (encrypted_key) ON public.api_keys FROM anon;
REVOKE SELECT (encrypted_value) ON public.external_keys FROM anon;
REVOKE SELECT (access_token_encrypted) ON public.github_connections FROM anon;
REVOKE SELECT (encrypted_value) ON public.integration_secrets FROM anon;
REVOKE SELECT (encrypted_token) ON public.project_mcp_tokens FROM anon;
REVOKE SELECT (encrypted_auth_token) ON public.webhook_custom_tools FROM anon;

-- 2) Audit logs: replace direct INSERT policy with a SECURITY DEFINER function
DROP POLICY IF EXISTS audit_self_insert ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _resource_type text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _org_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb,
  _user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _action IS NULL OR length(_action) = 0 OR length(_action) > 120 THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  -- Restrict action format to safe identifiers (letters, digits, dot, underscore, dash, colon)
  IF _action !~ '^[A-Za-z0-9_.:\-]+$' THEN
    RAISE EXCEPTION 'invalid action format';
  END IF;

  IF _resource_type IS NOT NULL AND length(_resource_type) > 80 THEN
    RAISE EXCEPTION 'invalid resource_type';
  END IF;
  IF _resource_id IS NOT NULL AND length(_resource_id) > 200 THEN
    RAISE EXCEPTION 'invalid resource_id';
  END IF;

  -- If org_id is provided, user must be a member
  IF _org_id IS NOT NULL AND NOT public.is_org_member(_uid, _org_id) THEN
    RAISE EXCEPTION 'not a member of org';
  END IF;

  INSERT INTO public.audit_logs (user_id, org_id, action, resource_type, resource_id, details, user_agent)
  VALUES (_uid, _org_id, _action, _resource_type, _resource_id, COALESCE(_details, '{}'::jsonb), left(_user_agent, 500))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, text, uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, uuid, jsonb, text) TO authenticated;
