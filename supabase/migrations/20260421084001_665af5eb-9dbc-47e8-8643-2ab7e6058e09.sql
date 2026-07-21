CREATE OR REPLACE FUNCTION public.get_product_metrics(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _dau int;
  _wau int;
  _mau int;
  _signups int;
  _with_project int;
  _with_message int;
  _series jsonb;
  _retention jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _days := GREATEST(1, LEAST(_days, 90));

  -- DAU / WAU / MAU (basé sur messages.owner_id)
  SELECT count(DISTINCT owner_id) INTO _dau
    FROM public.messages WHERE created_at >= now() - interval '1 day';
  SELECT count(DISTINCT owner_id) INTO _wau
    FROM public.messages WHERE created_at >= now() - interval '7 days';
  SELECT count(DISTINCT owner_id) INTO _mau
    FROM public.messages WHERE created_at >= now() - interval '30 days';

  -- Série DAU jour par jour
  SELECT coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'users', u) ORDER BY d), '[]'::jsonb)
  INTO _series
  FROM (
    SELECT date_trunc('day', gs)::date AS d,
           (SELECT count(DISTINCT owner_id) FROM public.messages
             WHERE created_at >= date_trunc('day', gs)
               AND created_at <  date_trunc('day', gs) + interval '1 day') AS u
    FROM generate_series(now() - (_days || ' days')::interval, now(), interval '1 day') gs
  ) s;

  -- Funnel : signups (organizations personnelles) → projet créé → message envoyé
  SELECT count(*) INTO _signups
    FROM public.organizations
   WHERE is_personal = true AND created_at >= now() - (_days || ' days')::interval;

  SELECT count(DISTINCT o.owner_id) INTO _with_project
    FROM public.organizations o
    JOIN public.projects p ON p.owner_id = o.owner_id
   WHERE o.is_personal = true AND o.created_at >= now() - (_days || ' days')::interval;

  SELECT count(DISTINCT o.owner_id) INTO _with_message
    FROM public.organizations o
    JOIN public.messages m ON m.owner_id = o.owner_id
   WHERE o.is_personal = true AND o.created_at >= now() - (_days || ' days')::interval;

  -- Rétention D1 / D7 / D30 sur cohortes des _days derniers jours
  WITH cohorts AS (
    SELECT owner_id, date_trunc('day', created_at)::date AS cohort_day
    FROM public.organizations
    WHERE is_personal = true
      AND created_at >= now() - (_days || ' days')::interval
  ),
  active AS (
    SELECT c.cohort_day,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.messages m
              WHERE m.owner_id = c.owner_id
                AND m.created_at::date = c.cohort_day + 1)) AS d1,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.messages m
              WHERE m.owner_id = c.owner_id
                AND m.created_at::date = c.cohort_day + 7)) AS d7,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.messages m
              WHERE m.owner_id = c.owner_id
                AND m.created_at::date = c.cohort_day + 30)) AS d30,
           count(*) AS total
    FROM cohorts c
    GROUP BY c.cohort_day
  )
  SELECT jsonb_build_object(
    'd1',  CASE WHEN sum(total) > 0 THEN round(100.0 * sum(d1)  / sum(total), 1) ELSE 0 END,
    'd7',  CASE WHEN sum(total) > 0 THEN round(100.0 * sum(d7)  / sum(total), 1) ELSE 0 END,
    'd30', CASE WHEN sum(total) > 0 THEN round(100.0 * sum(d30) / sum(total), 1) ELSE 0 END,
    'cohort_size', coalesce(sum(total), 0)
  ) INTO _retention
  FROM active;

  _result := jsonb_build_object(
    'days', _days,
    'dau', _dau,
    'wau', _wau,
    'mau', _mau,
    'series', _series,
    'funnel', jsonb_build_object(
      'signups', _signups,
      'with_project', _with_project,
      'with_message', _with_message
    ),
    'retention', _retention,
    'generated_at', now()
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_metrics(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_product_metrics(int) TO authenticated;