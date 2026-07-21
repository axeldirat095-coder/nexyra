
-- 1) capabilities: drop the broad authenticated read; keep admin-only
DROP POLICY IF EXISTS "Authenticated users can read capabilities" ON public.capabilities;

-- 2) github_connections: hide access_token_encrypted from client
REVOKE SELECT ON public.github_connections FROM authenticated;
GRANT SELECT (id, user_id, github_user_id, github_username, avatar_url, scope, created_at, updated_at)
  ON public.github_connections TO authenticated;

-- 3) integration_secrets: hide encrypted_value from client
REVOKE SELECT ON public.integration_secrets FROM authenticated;
GRANT SELECT (id, owner_id, integration_id, kind, expires_at, rotated_at, created_at, updated_at)
  ON public.integration_secrets TO authenticated;

-- 4) project_mcp_tokens: hide encrypted_token from client
REVOKE SELECT ON public.project_mcp_tokens FROM authenticated;
GRANT SELECT (owner_id, server_id, created_at, updated_at)
  ON public.project_mcp_tokens TO authenticated;

-- 5) webhook_custom_tools: hide encrypted_auth_token from client
REVOKE SELECT ON public.webhook_custom_tools FROM authenticated;
GRANT SELECT (id, owner_id, name, description, url, method, auth_kind, auth_header_name,
              body_template, parameters_schema, created_at, updated_at)
  ON public.webhook_custom_tools TO authenticated;

-- 6) llm_cache: remove admin client read; admin tooling uses service_role server-side
DROP POLICY IF EXISTS "Admins can view llm_cache" ON public.llm_cache;
REVOKE SELECT ON public.llm_cache FROM authenticated;
