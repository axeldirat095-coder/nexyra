-- Table des clés externes (BYOK utilisateur — indépendant de Lovable Cloud secrets)
CREATE TABLE public.external_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service text NOT NULL,                  -- ex: 'deepseek', 'github', 'vercel', 'elevenlabs'
  label text,                             -- libellé optionnel
  encrypted_value bytea NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, service)
);

CREATE INDEX idx_external_keys_owner ON public.external_keys(owner_id);

ALTER TABLE public.external_keys ENABLE ROW LEVEL SECURITY;

-- RLS : un utilisateur ne voit/édite QUE ses propres clés (jamais le contenu chiffré côté client de toute façon)
CREATE POLICY "Users see their own external keys"
  ON public.external_keys FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert their own external keys"
  ON public.external_keys FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update their own external keys"
  ON public.external_keys FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users delete their own external keys"
  ON public.external_keys FOR DELETE
  USING (auth.uid() = owner_id);

-- Trigger updated_at
CREATE TRIGGER trg_external_keys_updated_at
BEFORE UPDATE ON public.external_keys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC : enregistrer/mettre à jour une clé (chiffrée)
CREATE OR REPLACE FUNCTION public.set_external_key(
  _service text,
  _key text,
  _label text DEFAULT NULL
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
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _key IS NULL OR length(_key) < 8 THEN
    RAISE EXCEPTION 'Invalid key';
  END IF;
  IF _service IS NULL OR length(_service) < 2 THEN
    RAISE EXCEPTION 'Invalid service';
  END IF;

  INSERT INTO public.external_keys (owner_id, service, label, encrypted_value, is_active)
  VALUES (
    _uid,
    lower(_service),
    _label,
    extensions.pgp_sym_encrypt(_key, public._api_key_passphrase()),
    true
  )
  ON CONFLICT (owner_id, service) DO UPDATE
    SET encrypted_value = EXCLUDED.encrypted_value,
        label = COALESCE(EXCLUDED.label, public.external_keys.label),
        is_active = true,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- RPC : déchiffrer une clé (server-side only via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_external_key_decrypted(
  _owner_id uuid,
  _service text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enc bytea;
BEGIN
  SELECT encrypted_value INTO _enc
  FROM public.external_keys
  WHERE owner_id = _owner_id
    AND service = lower(_service)
    AND is_active = true
  LIMIT 1;

  IF _enc IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(_enc, public._api_key_passphrase());
END;
$$;

-- RPC : marquer comme utilisée
CREATE OR REPLACE FUNCTION public.mark_external_key_used(
  _owner_id uuid,
  _service text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.external_keys
     SET last_used_at = now()
   WHERE owner_id = _owner_id AND service = lower(_service);
$$;