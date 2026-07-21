
-- 1) GitHub token: convert text -> bytea, encrypted with the same passphrase pattern as api_keys
ALTER TABLE public.github_connections DROP COLUMN IF EXISTS access_token_encrypted;
ALTER TABLE public.github_connections ADD COLUMN access_token_encrypted bytea;

CREATE OR REPLACE FUNCTION public.set_github_token(_user_id uuid, _token text, _github_user_id bigint, _github_username text, _scope text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;
  INSERT INTO public.github_connections (user_id, github_user_id, github_username, access_token_encrypted, scope)
  VALUES (_user_id, _github_user_id, _github_username,
          extensions.pgp_sym_encrypt(_token, public._api_key_passphrase()), _scope)
  ON CONFLICT (user_id) DO UPDATE
    SET github_user_id = EXCLUDED.github_user_id,
        github_username = EXCLUDED.github_username,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        scope = EXCLUDED.scope,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_github_token(_user_id uuid)
RETURNS TABLE(token text, github_username text, github_user_id bigint, scope text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT extensions.pgp_sym_decrypt(gc.access_token_encrypted, public._api_key_passphrase())::text,
         gc.github_username, gc.github_user_id, gc.scope
  FROM public.github_connections gc
  WHERE gc.user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_github_token(uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_github_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_github_token(uuid,text,bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_github_token(uuid) TO service_role;

-- 2) Realtime topic policy: exact match instead of LIKE substring
DROP POLICY IF EXISTS topic_scoped_realtime_select ON realtime.messages;
CREATE POLICY topic_scoped_realtime_select ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() = 'capabilities-live'
  OR realtime.topic() = 'budget-notif-' || (auth.uid())::text
);
