CREATE OR REPLACE FUNCTION public.get_routing_distribution(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _result jsonb;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin'::app_role) INTO _is_admin;

  WITH src AS (
    SELECT
      COALESCE(NULLIF(LOWER(m.metadata->>'intent_level'), ''), 'unknown') AS level,
      COALESCE(m.cost_usd, 0) AS cost,
      COALESCE(m.tokens_input, 0) + COALESCE(m.tokens_output, 0) AS tokens
    FROM public.messages m
    WHERE m.created_at >= now() - make_interval(days => _days)
      AND m.role = 'assistant'
      AND (_is_admin OR m.owner_id = auth.uid())
  ),
  agg AS (
    SELECT level,
           COUNT(*)::bigint AS messages,
           SUM(cost)::numeric AS cost,
           SUM(tokens)::bigint AS tokens
    FROM src
    GROUP BY level
  ),
  total AS (
    SELECT COALESCE(SUM(messages), 0)::bigint AS total_messages,
           COALESCE(SUM(cost), 0)::numeric AS total_cost
    FROM agg
  )
  SELECT jsonb_build_object(
    'days', _days,
    'is_admin_view', _is_admin,
    'total_messages', (SELECT total_messages FROM total),
    'total_cost', (SELECT total_cost FROM total),
    'levels', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'level', a.level,
          'messages', a.messages,
          'cost', a.cost,
          'tokens', a.tokens,
          'share_pct', CASE
            WHEN (SELECT total_messages FROM total) = 0 THEN 0
            ELSE ROUND((a.messages::numeric * 100) / (SELECT total_messages FROM total), 1)
          END
        ) ORDER BY a.messages DESC)
       FROM agg a),
      '[]'::jsonb
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_routing_distribution(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_routing_distribution(integer) TO authenticated;