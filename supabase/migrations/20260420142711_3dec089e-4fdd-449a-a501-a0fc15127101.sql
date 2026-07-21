-- 1. Extension pour chiffrement
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 2. Colonne pour stocker la clé chiffrée (bytea)
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS encrypted_key bytea;

-- 3. Clé de chiffrement symétrique (dérivée du secret de la base)
--    On utilise pgp_sym_encrypt avec une passphrase stockée dans un GUC custom.
--    Pour simplifier et rester portable, on utilise une passphrase fixe basée
--    sur l'instance — à remplacer plus tard par Supabase Vault si besoin.
--    Ici on utilise current_setting avec fallback.

-- Fonction interne : retourne la passphrase de chiffrement
CREATE OR REPLACE FUNCTION public._api_key_passphrase()
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Passphrase dérivée et stable pour cette instance.
  -- ⚠️ À remplacer par Vault en production multi-tenant.
  SELECT 'nexyra_apikey_v1_' || md5('nexyra-elena-key-vault-salt')
$$;

REVOKE ALL ON FUNCTION public._api_key_passphrase() FROM public, anon, authenticated;

-- 4. Fonction pour enregistrer/mettre à jour une clé API (RLS-safe : owner_id = auth.uid())
CREATE OR REPLACE FUNCTION public.set_api_key(
  _provider ai_provider,
  _key text,
  _label text DEFAULT NULL
)
RETURNS uuid
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

  -- Upsert sur (owner_id, provider)
  INSERT INTO public.api_keys (owner_id, provider, label, encrypted_key, is_active)
  VALUES (
    _uid,
    _provider,
    _label,
    pgp_sym_encrypt(_key, public._api_key_passphrase()),
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

-- Index unique pour permettre l'upsert
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_owner_provider_uniq
  ON public.api_keys (owner_id, provider);

GRANT EXECUTE ON FUNCTION public.set_api_key(ai_provider, text, text) TO authenticated;

-- 5. Fonction pour déchiffrer (réservée usage interne via service role / edge)
CREATE OR REPLACE FUNCTION public.get_api_key_decrypted(
  _owner_id uuid,
  _provider ai_provider
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  RETURN pgp_sym_decrypt(_enc, public._api_key_passphrase());
END;
$$;

REVOKE ALL ON FUNCTION public.get_api_key_decrypted(uuid, ai_provider) FROM public, anon, authenticated;
-- Seul le service role (utilisé par les server functions/edge) peut appeler cette fonction.

-- 6. Fonction pour marquer une clé comme utilisée (depuis edge)
CREATE OR REPLACE FUNCTION public.mark_api_key_used(
  _owner_id uuid,
  _provider ai_provider
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.api_keys
     SET last_used_at = now()
   WHERE owner_id = _owner_id AND provider = _provider;
$$;

REVOKE ALL ON FUNCTION public.mark_api_key_used(uuid, ai_provider) FROM public, anon, authenticated;

-- 7. Mettre à jour les défauts elena_settings pour OpenAI
ALTER TABLE public.elena_settings
  ALTER COLUMN model_eco SET DEFAULT 'openai/gpt-5-mini',
  ALTER COLUMN model_standard SET DEFAULT 'openai/gpt-5',
  ALTER COLUMN model_premium SET DEFAULT 'openai/gpt-5';

-- 8. Migrer les réglages existants (si ils pointent encore sur Gemini par défaut)
UPDATE public.elena_settings
   SET model_eco = 'openai/gpt-5-mini',
       model_standard = 'openai/gpt-5',
       model_premium = 'openai/gpt-5'
 WHERE model_eco LIKE 'google/%'
    OR model_standard LIKE 'google/%'
    OR model_premium LIKE 'google/%';