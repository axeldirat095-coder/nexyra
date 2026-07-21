-- Table des quotas utilisateur (kill-switch)
CREATE TABLE public.user_quotas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  monthly_hard_limit_usd NUMERIC(10,4) NOT NULL DEFAULT 10.00,
  hard_block BOOLEAN NOT NULL DEFAULT false,
  blocked_until TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

-- RLS : user voit son quota, admin voit tout
CREATE POLICY "user_select_own_quota"
ON public.user_quotas FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Seuls les admins peuvent insérer/modifier (anti-contournement)
CREATE POLICY "admin_insert_quota"
ON public.user_quotas FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_quota"
ON public.user_quotas FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_delete_quota"
ON public.user_quotas FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_user_quotas_updated_at
BEFORE UPDATE ON public.user_quotas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fonction : check si user peut envoyer (appelée par /api/elena-chat)
CREATE OR REPLACE FUNCTION public.check_user_quota(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quota RECORD;
  _current_usage NUMERIC;
BEGIN
  -- Récupère ou crée le quota par défaut
  SELECT * INTO _quota FROM public.user_quotas WHERE user_id = _user_id;
  
  IF NOT FOUND THEN
    -- Pas de quota défini = pas de blocage (limite par défaut très haute)
    RETURN jsonb_build_object('allowed', true, 'usage', 0, 'limit', 999999);
  END IF;

  -- Hard block manuel ?
  IF _quota.hard_block THEN
    IF _quota.blocked_until IS NULL OR _quota.blocked_until > now() THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', COALESCE(_quota.reason, 'Compte temporairement suspendu'),
        'blocked_until', _quota.blocked_until
      );
    END IF;
  END IF;

  -- Calcule usage du mois en cours
  SELECT COALESCE(SUM(cost_usd), 0) INTO _current_usage
  FROM public.messages
  WHERE owner_id = _user_id
    AND created_at >= date_trunc('month', now());

  IF _current_usage >= _quota.monthly_hard_limit_usd THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Limite mensuelle atteinte (' || _quota.monthly_hard_limit_usd || ' USD)',
      'usage', _current_usage,
      'limit', _quota.monthly_hard_limit_usd
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'usage', _current_usage,
    'limit', _quota.monthly_hard_limit_usd,
    'remaining', _quota.monthly_hard_limit_usd - _current_usage
  );
END;
$$;

-- Fonction publique pour l'UI (utilisateur voit son propre statut)
CREATE OR REPLACE FUNCTION public.get_user_quota_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.check_user_quota(_uid);
END;
$$;