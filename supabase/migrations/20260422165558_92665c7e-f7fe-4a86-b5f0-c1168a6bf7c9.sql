-- 1. Quotas par projet
CREATE TABLE IF NOT EXISTS public.project_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  monthly_hard_limit_usd numeric NOT NULL DEFAULT 10,
  hard_block boolean NOT NULL DEFAULT false,
  blocked_until timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all project quotas"
  ON public.project_quotas
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Project owners can view their quota"
  ON public.project_quotas
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_quotas.project_id
      AND p.owner_id = auth.uid()
  ));

CREATE TRIGGER project_quotas_set_updated_at
BEFORE UPDATE ON public.project_quotas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Mode brouillon sur projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS draft_mode boolean NOT NULL DEFAULT false;

-- 3. Fonction unifiée : check user + project quota
CREATE OR REPLACE FUNCTION public.check_project_quota(_user_id uuid, _project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_check jsonb;
  _pq RECORD;
  _project_usage numeric;
BEGIN
  -- 1. User quota d'abord (kill-switch global)
  _user_check := public.check_user_quota(_user_id);
  IF (_user_check->>'allowed')::boolean = false THEN
    RETURN _user_check;
  END IF;

  -- 2. Project quota si défini
  IF _project_id IS NOT NULL THEN
    SELECT * INTO _pq FROM public.project_quotas WHERE project_id = _project_id;

    IF FOUND THEN
      -- Hard block manuel ?
      IF _pq.hard_block THEN
        IF _pq.blocked_until IS NULL OR _pq.blocked_until > now() THEN
          RETURN jsonb_build_object(
            'allowed', false,
            'scope', 'project',
            'reason', COALESCE(_pq.reason, 'Projet temporairement suspendu'),
            'blocked_until', _pq.blocked_until
          );
        END IF;
      END IF;

      -- Usage du mois pour ce projet
      SELECT COALESCE(SUM(m.cost_usd), 0) INTO _project_usage
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE c.project_id = _project_id
        AND m.created_at >= date_trunc('month', now());

      IF _project_usage >= _pq.monthly_hard_limit_usd THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'scope', 'project',
          'reason', 'Budget projet atteint (' || _pq.monthly_hard_limit_usd || ' USD)',
          'usage', _project_usage,
          'limit', _pq.monthly_hard_limit_usd
        );
      END IF;

      RETURN jsonb_build_object(
        'allowed', true,
        'scope', 'project',
        'usage', _project_usage,
        'limit', _pq.monthly_hard_limit_usd,
        'remaining', _pq.monthly_hard_limit_usd - _project_usage,
        'user', _user_check
      );
    END IF;
  END IF;

  -- Pas de quota projet → renvoie le user check
  RETURN _user_check;
END;
$$;