-- 1) chat-images : retirer la policy SELECT broad qui autorise le listing.
-- Les URLs publiques /object/public/chat-images/... continuent de fonctionner car le bucket reste public.
DROP POLICY IF EXISTS "chat-images public read" ON storage.objects;

-- 2) project_mcp_tokens : chiffrement
ALTER TABLE public.project_mcp_tokens
  ADD COLUMN IF NOT EXISTS encrypted_token bytea;

UPDATE public.project_mcp_tokens
   SET encrypted_token = extensions.pgp_sym_encrypt(token, public._api_key_passphrase())
 WHERE encrypted_token IS NULL AND token IS NOT NULL;

ALTER TABLE public.project_mcp_tokens DROP COLUMN IF EXISTS token;

CREATE OR REPLACE FUNCTION public.set_mcp_token(_server_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _token IS NULL OR length(_token) < 4 THEN RAISE EXCEPTION 'Invalid token'; END IF;

  INSERT INTO public.project_mcp_tokens (server_id, owner_id, encrypted_token)
  VALUES (_server_id, _uid, extensions.pgp_sym_encrypt(_token, public._api_key_passphrase()))
  ON CONFLICT (server_id) DO UPDATE
    SET encrypted_token = EXCLUDED.encrypted_token,
        updated_at = now()
  WHERE public.project_mcp_tokens.owner_id = _uid;
END $$;

CREATE OR REPLACE FUNCTION public.get_mcp_token_decrypted(_server_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _enc bytea; _owner uuid;
BEGIN
  SELECT encrypted_token, owner_id INTO _enc, _owner
    FROM public.project_mcp_tokens WHERE server_id = _server_id;
  IF _enc IS NULL THEN RETURN NULL; END IF;
  IF _owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN extensions.pgp_sym_decrypt(_enc, public._api_key_passphrase());
END $$;

-- 3) webhook_custom_tools : chiffrement de auth_token
ALTER TABLE public.webhook_custom_tools
  ADD COLUMN IF NOT EXISTS encrypted_auth_token bytea;

UPDATE public.webhook_custom_tools
   SET encrypted_auth_token = extensions.pgp_sym_encrypt(auth_token, public._api_key_passphrase())
 WHERE auth_token IS NOT NULL AND encrypted_auth_token IS NULL;

ALTER TABLE public.webhook_custom_tools DROP COLUMN IF EXISTS auth_token;

CREATE OR REPLACE FUNCTION public.set_webhook_auth_token(_webhook_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT owner_id INTO _owner FROM public.webhook_custom_tools WHERE id = _webhook_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Webhook not found'; END IF;
  IF _owner <> _uid AND NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.webhook_custom_tools
     SET encrypted_auth_token = CASE
           WHEN _token IS NULL OR length(_token) = 0 THEN NULL
           ELSE extensions.pgp_sym_encrypt(_token, public._api_key_passphrase())
         END,
         updated_at = now()
   WHERE id = _webhook_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_webhook_auth_token_decrypted(_owner_id uuid, _name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _enc bytea;
BEGIN
  IF auth.uid() <> _owner_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT encrypted_auth_token INTO _enc
    FROM public.webhook_custom_tools
   WHERE owner_id = _owner_id AND name = _name;
  IF _enc IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(_enc, public._api_key_passphrase());
END $$;