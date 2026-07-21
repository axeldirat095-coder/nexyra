-- Table budget_alerts
CREATE TABLE public.budget_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE,
  monthly_limit_usd NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  last_alert_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_budget" ON public.budget_alerts
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owner_insert_budget" ON public.budget_alerts
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_update_budget" ON public.budget_alerts
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER trg_budget_alerts_updated
  BEFORE UPDATE ON public.budget_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index sur messages.created_at pour accélérer les agrégats coûts
CREATE INDEX IF NOT EXISTS idx_messages_owner_created ON public.messages (owner_id, created_at DESC);

-- Fonction get_costs_summary
CREATE OR REPLACE FUNCTION public.get_costs_summary(_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _is_admin BOOLEAN;
  _result JSONB;
  _total_cost NUMERIC;
  _total_tokens BIGINT;
  _series JSONB;
  _top_projects JSONB;
  _month_usage NUMERIC;
  _limit NUMERIC;
  _threshold INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  _days := GREATEST(1, LEAST(_days, 90));
  _is_admin := has_role(_uid, 'admin'::app_role);

  -- Totaux
  SELECT COALESCE(SUM(cost_usd), 0), COALESCE(SUM(COALESCE(tokens_input,0) + COALESCE(tokens_output,0)), 0)
    INTO _total_cost, _total_tokens
    FROM public.messages
   WHERE created_at >= now() - (_days || ' days')::interval
     AND (_is_admin OR owner_id = _uid);

  -- Série jour par jour
  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d::date, 'cost', c, 'tokens', t) ORDER BY d), '[]'::jsonb)
    INTO _series
    FROM (
      SELECT date_trunc('day', gs)::date AS d,
             COALESCE((SELECT SUM(cost_usd) FROM public.messages
                        WHERE created_at >= date_trunc('day', gs)
                          AND created_at < date_trunc('day', gs) + interval '1 day'
                          AND (_is_admin OR owner_id = _uid)), 0) AS c,
             COALESCE((SELECT SUM(COALESCE(tokens_input,0) + COALESCE(tokens_output,0)) FROM public.messages
                        WHERE created_at >= date_trunc('day', gs)
                          AND created_at < date_trunc('day', gs) + interval '1 day'
                          AND (_is_admin OR owner_id = _uid)), 0) AS t
      FROM generate_series(now() - (_days || ' days')::interval, now(), interval '1 day') gs
    ) s;

  -- Top 5 projets
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'project_id', project_id,
           'project_name', project_name,
           'cost', cost,
           'messages', msgs
         ) ORDER BY cost DESC), '[]'::jsonb)
    INTO _top_projects
    FROM (
      SELECT p.id AS project_id,
             p.name AS project_name,
             COALESCE(SUM(m.cost_usd), 0) AS cost,
             COUNT(m.id) AS msgs
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        JOIN public.projects p ON p.id = c.project_id
       WHERE m.created_at >= now() - (_days || ' days')::interval
         AND (_is_admin OR m.owner_id = _uid)
       GROUP BY p.id, p.name
       ORDER BY cost DESC
       LIMIT 5
    ) tp;

  -- Usage mois en cours + limite
  SELECT COALESCE(SUM(cost_usd), 0) INTO _month_usage
    FROM public.messages
   WHERE created_at >= date_trunc('month', now())
     AND owner_id = _uid;

  SELECT monthly_limit_usd, alert_threshold_pct
    INTO _limit, _threshold
    FROM public.budget_alerts
   WHERE owner_id = _uid;

  _result := jsonb_build_object(
    'days', _days,
    'is_admin_view', _is_admin,
    'total_cost', _total_cost,
    'total_tokens', _total_tokens,
    'series', _series,
    'top_projects', _top_projects,
    'month_usage', _month_usage,
    'monthly_limit', COALESCE(_limit, 0),
    'alert_threshold_pct', COALESCE(_threshold, 80),
    'over_threshold', CASE
      WHEN _limit IS NOT NULL AND _limit > 0
       AND _month_usage >= (_limit * COALESCE(_threshold, 80) / 100.0)
      THEN true ELSE false END,
    'over_limit', CASE
      WHEN _limit IS NOT NULL AND _limit > 0 AND _month_usage >= _limit
      THEN true ELSE false END,
    'generated_at', now()
  );

  RETURN _result;
END;
$$;