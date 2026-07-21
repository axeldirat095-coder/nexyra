CREATE OR REPLACE FUNCTION public.get_api_key_decrypted(_owner_id uuid, _provider ai_provider)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _enc bytea;
BEGIN
  SELECT encrypted_key INTO _enc
  FROM public.api_keys
  WHERE owner_id = _owner_id
    AND provider = _provider
    AND is_active = true
  LIMIT 1;

  IF _enc IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN extensions.pgp_sym_decrypt(_enc, public._api_key_passphrase());
END;
$$;

CREATE OR REPLACE FUNCTION public.set_api_key(_provider ai_provider, _key text, _label text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _key IS NULL OR length(_key) < 8 THEN
    RAISE EXCEPTION 'Invalid key';
  END IF;

  INSERT INTO public.api_keys (owner_id, provider, label, encrypted_key, is_active)
  VALUES (
    _uid,
    _provider,
    _label,
    extensions.pgp_sym_encrypt(_key, public._api_key_passphrase()),
    true
  )
  ON CONFLICT (owner_id, provider) DO UPDATE
    SET encrypted_key = EXCLUDED.encrypted_key,
        label = COALESCE(EXCLUDED.label, public.api_keys.label),
        is_active = true
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;