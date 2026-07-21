
CREATE TABLE public.elena_savings_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  route text NOT NULL DEFAULT 'elena-e2b',
  model text,
  -- Chantier 4 : troncature vieux tool outputs
  trunc_parts int NOT NULL DEFAULT 0,
  trunc_saved_tk int NOT NULL DEFAULT 0,
  -- Chantier 6 : dedup cross-tours
  dedup_parts int NOT NULL DEFAULT 0,
  dedup_saved_tk int NOT NULL DEFAULT 0,
  -- Chantier 5 : cache prompt Anthropic (OpenRouter)
  cache_read_tk bigint NOT NULL DEFAULT 0,
  cache_write_tk bigint NOT NULL DEFAULT 0,
  -- Usage total du tour
  input_tk bigint NOT NULL DEFAULT 0,
  output_tk bigint NOT NULL DEFAULT 0,
  -- Estimation gains USD ($3/M input Claude Sonnet, cache read = 10%)
  saved_usd numeric(10,6) NOT NULL DEFAULT 0
);

CREATE INDEX idx_elena_savings_log_owner_created ON public.elena_savings_log (owner_id, created_at DESC);
CREATE INDEX idx_elena_savings_log_project_created ON public.elena_savings_log (project_id, created_at DESC);

GRANT SELECT ON public.elena_savings_log TO authenticated;
GRANT ALL ON public.elena_savings_log TO service_role;

ALTER TABLE public.elena_savings_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows or admin"
  ON public.elena_savings_log FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.elena_savings_summary(_days int DEFAULT 7, _project_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _tot jsonb;
  _by_proj jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _is_admin := public.has_role(_uid, 'admin'::app_role);
  _days := GREATEST(1, LEAST(_days, 90));

  SELECT jsonb_build_object(
    'turns', count(*),
    'trunc_saved_tk', COALESCE(sum(trunc_saved_tk), 0),
    'dedup_saved_tk', COALESCE(sum(dedup_saved_tk), 0),
    'cache_read_tk', COALESCE(sum(cache_read_tk), 0),
    'cache_write_tk', COALESCE(sum(cache_write_tk), 0),
    'input_tk', COALESCE(sum(input_tk), 0),
    'output_tk', COALESCE(sum(output_tk), 0),
    'saved_usd', COALESCE(sum(saved_usd), 0)
  ) INTO _tot
  FROM public.elena_savings_log
  WHERE created_at >= now() - make_interval(days => _days)
    AND (_is_admin OR owner_id = _uid)
    AND (_project_id IS NULL OR project_id = _project_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'project_id', project_id,
    'turns', turns,
    'saved_tk', saved_tk,
    'saved_usd', saved_usd,
    'cache_hit_pct', cache_hit_pct
  ) ORDER BY saved_tk DESC), '[]'::jsonb)
  INTO _by_proj
  FROM (
    SELECT project_id,
           count(*) AS turns,
           COALESCE(sum(trunc_saved_tk + dedup_saved_tk), 0) AS saved_tk,
           COALESCE(sum(saved_usd), 0) AS saved_usd,
           CASE WHEN sum(input_tk) > 0
                THEN ROUND(100.0 * sum(cache_read_tk) / sum(input_tk), 1)
                ELSE 0 END AS cache_hit_pct
    FROM public.elena_savings_log
    WHERE created_at >= now() - make_interval(days => _days)
      AND (_is_admin OR owner_id = _uid)
    GROUP BY project_id
    ORDER BY saved_tk DESC
    LIMIT 20
  ) x;

  RETURN jsonb_build_object(
    'days', _days,
    'is_admin', _is_admin,
    'total', _tot,
    'by_project', _by_proj,
    'generated_at', now()
  );
END;
$$;
