-- 1) RPC: capability_upsert (admin only) — pour auto-sync /capabilities depuis Elena
CREATE OR REPLACE FUNCTION public.capability_upsert(
  _category_id text,
  _category_label text,
  _category_icon text,
  _title text,
  _info text,
  _status capability_status DEFAULT 'todo'::capability_status,
  _priority capability_priority DEFAULT 'P1'::capability_priority
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _next_pos integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden — admin role required for capability sync';
  END IF;

  -- Match par (category_id, title) car pas de contrainte unique
  SELECT id INTO _existing
  FROM public.capabilities
  WHERE category_id = _category_id AND title = _title
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.capabilities
       SET status = _status,
           info = _info,
           priority = _priority,
           category_label = _category_label,
           category_icon = _category_icon,
           completed_at = CASE WHEN _status = 'done'::capability_status AND completed_at IS NULL THEN now() ELSE completed_at END,
           started_at = CASE WHEN _status = 'in_progress'::capability_status AND started_at IS NULL THEN now() ELSE started_at END,
           updated_at = now()
     WHERE id = _existing;
    RETURN _existing;
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO _next_pos
  FROM public.capabilities
  WHERE category_id = _category_id;

  INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority, position,
                                   started_at, completed_at)
  VALUES (_category_id, _category_label, _category_icon, _title, _info, _status, _priority, _next_pos,
          CASE WHEN _status = 'in_progress'::capability_status THEN now() ELSE NULL END,
          CASE WHEN _status = 'done'::capability_status THEN now() ELSE NULL END)
  RETURNING id INTO _existing;

  RETURN _existing;
END;
$$;

-- 2) RPC: estimate_project_cost — projection mensuelle basée sur les 30 derniers jours
CREATE OR REPLACE FUNCTION public.estimate_project_cost(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owner boolean;
  _last30_cost numeric;
  _last30_msgs integer;
  _last7_cost numeric;
  _last7_msgs integer;
  _by_model jsonb;
  _projected_monthly numeric;
  _avg_per_msg numeric;
  _quota numeric;
BEGIN
  SELECT (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    INTO _is_owner
    FROM public.projects p
   WHERE p.id = _project_id;

  IF NOT COALESCE(_is_owner, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 30 derniers jours
  SELECT COALESCE(SUM(m.cost_usd), 0), COUNT(*)
    INTO _last30_cost, _last30_msgs
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
   WHERE c.project_id = _project_id
     AND m.created_at >= now() - interval '30 days'
     AND m.role = 'assistant';

  -- 7 derniers jours
  SELECT COALESCE(SUM(m.cost_usd), 0), COUNT(*)
    INTO _last7_cost, _last7_msgs
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
   WHERE c.project_id = _project_id
     AND m.created_at >= now() - interval '7 days'
     AND m.role = 'assistant';

  -- Répartition par modèle
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'model', model_used,
    'cost', cost,
    'messages', msgs
  ) ORDER BY cost DESC), '[]'::jsonb) INTO _by_model
  FROM (
    SELECT COALESCE(m.model_used, 'unknown') AS model_used,
           COALESCE(SUM(m.cost_usd), 0) AS cost,
           COUNT(*) AS msgs
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE c.project_id = _project_id
       AND m.created_at >= now() - interval '30 days'
       AND m.role = 'assistant'
     GROUP BY COALESCE(m.model_used, 'unknown')
     ORDER BY cost DESC
     LIMIT 5
  ) t;

  -- Projection : préfère les 7 derniers jours s'il y a de l'activité, sinon les 30 jours
  IF _last7_msgs > 0 THEN
    _projected_monthly := (_last7_cost / 7.0) * 30;
    _avg_per_msg := _last7_cost / GREATEST(_last7_msgs, 1);
  ELSIF _last30_msgs > 0 THEN
    _projected_monthly := _last30_cost;
    _avg_per_msg := _last30_cost / GREATEST(_last30_msgs, 1);
  ELSE
    _projected_monthly := 0;
    _avg_per_msg := 0;
  END IF;

  SELECT monthly_hard_limit_usd INTO _quota
    FROM public.project_quotas WHERE project_id = _project_id;

  RETURN jsonb_build_object(
    'project_id', _project_id,
    'last30_days', jsonb_build_object('cost_usd', _last30_cost, 'messages', _last30_msgs),
    'last7_days', jsonb_build_object('cost_usd', _last7_cost, 'messages', _last7_msgs),
    'avg_per_message_usd', _avg_per_msg,
    'projected_monthly_usd', _projected_monthly,
    'quota_monthly_usd', _quota,
    'pct_of_quota', CASE WHEN _quota IS NULL OR _quota = 0 THEN NULL
                         ELSE ROUND((_projected_monthly / _quota) * 100, 1) END,
    'top_models', _by_model,
    'generated_at', now()
  );
END;
$$;