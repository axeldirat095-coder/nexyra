
-- Fonction admin : pose un secret chiffré pour une intégration
-- (utilisée par le callback OAuth qui n'a pas auth.uid() en main)
CREATE OR REPLACE FUNCTION public.admin_set_integration_secret(
  _integration_id uuid,
  _kind public.integration_secret_kind,
  _value text,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _id uuid;
BEGIN
  IF _value IS NULL OR length(_value) < 4 THEN
    RAISE EXCEPTION 'Invalid secret value';
  END IF;

  SELECT owner_id INTO _owner
    FROM public.project_integrations
   WHERE id = _integration_id;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Integration not found';
  END IF;

  INSERT INTO public.integration_secrets (
    integration_id, owner_id, kind, encrypted_value, expires_at, rotated_at
  )
  VALUES (
    _integration_id,
    _owner,
    _kind,
    extensions.pgp_sym_encrypt(_value, public._api_key_passphrase()),
    _expires_at,
    now()
  )
  ON CONFLICT (integration_id, kind) DO UPDATE
    SET encrypted_value = EXCLUDED.encrypted_value,
        expires_at = EXCLUDED.expires_at,
        rotated_at = now(),
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- Réservée au rôle service (pas anon, pas authenticated)
REVOKE EXECUTE ON FUNCTION public.admin_set_integration_secret(uuid, public.integration_secret_kind, text, timestamptz) FROM anon, authenticated;

-- Fonction admin : refresh expiry sans changer la valeur
CREATE OR REPLACE FUNCTION public.admin_refresh_integration_secret_expiry(
  _integration_id uuid,
  _kind public.integration_secret_kind,
  _expires_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.integration_secrets
     SET expires_at = _expires_at,
         updated_at = now()
   WHERE integration_id = _integration_id AND kind = _kind;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_refresh_integration_secret_expiry(uuid, public.integration_secret_kind, timestamptz) FROM anon, authenticated;
