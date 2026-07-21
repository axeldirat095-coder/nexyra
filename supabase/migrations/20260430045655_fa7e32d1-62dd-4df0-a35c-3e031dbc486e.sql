
-- Type de secret (extensible)
CREATE TYPE public.integration_secret_kind AS ENUM (
  'access_token',
  'refresh_token',
  'api_key',
  'client_id',
  'client_secret',
  'webhook_secret',
  'other'
);

-- =====================================================
-- TABLE : integration_secrets (chiffrée)
-- =====================================================
CREATE TABLE public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.project_integrations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind public.integration_secret_kind NOT NULL,
  encrypted_value bytea NOT NULL,
  expires_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, kind)
);

CREATE INDEX idx_integration_secrets_integration ON public.integration_secrets(integration_id);
CREATE INDEX idx_integration_secrets_owner ON public.integration_secrets(owner_id);

ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

-- Le propriétaire peut voir l'EXISTENCE de ses secrets (mais pas leur valeur via API)
CREATE POLICY "Owner sees own integration secret rows"
  ON public.integration_secrets FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Insertion/update/delete uniquement via fonctions SECURITY DEFINER (donc on bloque l'accès direct)
CREATE POLICY "Block direct insert on secrets"
  ON public.integration_secrets FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update on secrets"
  ON public.integration_secrets FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Owner can delete via cascade only"
  ON public.integration_secrets FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trg_integration_secrets_updated_at
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- FONCTION : set_integration_secret
-- Chiffre + upsert un secret pour une intégration
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_integration_secret(
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
  _uid uuid := auth.uid();
  _owner uuid;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _value IS NULL OR length(_value) < 4 THEN
    RAISE EXCEPTION 'Invalid secret value';
  END IF;

  -- Vérifie ownership de l'intégration
  SELECT owner_id INTO _owner
    FROM public.project_integrations
   WHERE id = _integration_id;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Integration not found';
  END IF;

  IF _owner <> _uid AND NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden — not owner of integration';
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

REVOKE EXECUTE ON FUNCTION public.set_integration_secret(uuid, public.integration_secret_kind, text, timestamptz) FROM anon;

-- =====================================================
-- FONCTION : get_integration_secret_decrypted
-- Réservée côté serveur (service_role) pour utiliser le token
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_integration_secret_decrypted(
  _integration_id uuid,
  _kind public.integration_secret_kind
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enc bytea;
  _exp timestamptz;
BEGIN
  SELECT encrypted_value, expires_at
    INTO _enc, _exp
    FROM public.integration_secrets
   WHERE integration_id = _integration_id
     AND kind = _kind
   LIMIT 1;

  IF _enc IS NULL THEN
    RETURN NULL;
  END IF;

  IF _exp IS NOT NULL AND _exp < now() THEN
    -- Secret expiré : on retourne NULL pour forcer un refresh côté serveur
    RETURN NULL;
  END IF;

  RETURN extensions.pgp_sym_decrypt(_enc, public._api_key_passphrase());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_integration_secret_decrypted(uuid, public.integration_secret_kind) FROM anon, authenticated;

-- =====================================================
-- TABLE : integration_oauth_states
-- Anti-CSRF pour le flow OAuth
-- =====================================================
CREATE TABLE public.integration_oauth_states (
  state text PRIMARY KEY,
  owner_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.integration_catalog(id) ON DELETE CASCADE,
  code_verifier text,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX idx_oauth_states_expires ON public.integration_oauth_states(expires_at);

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- Lecture/écriture uniquement par le owner via service role en pratique
CREATE POLICY "Owner reads own oauth states"
  ON public.integration_oauth_states FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner inserts own oauth states"
  ON public.integration_oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes own oauth states"
  ON public.integration_oauth_states FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
