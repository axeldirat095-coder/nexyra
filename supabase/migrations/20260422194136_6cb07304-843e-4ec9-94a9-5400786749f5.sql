
CREATE TABLE public.budget_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  scope TEXT NOT NULL CHECK (scope IN ('user', 'project')),
  kind TEXT NOT NULL CHECK (kind IN ('warning', 'blocked')),
  threshold_pct INTEGER NOT NULL,
  usage_usd NUMERIC NOT NULL,
  limit_usd NUMERIC NOT NULL,
  message TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_notif_user_unread ON public.budget_notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_budget_notif_user_kind ON public.budget_notifications(user_id, scope, kind, created_at DESC);

ALTER TABLE public.budget_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_budget_notif"
  ON public.budget_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users_update_own_budget_notif"
  ON public.budget_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "system_insert_budget_notif"
  ON public.budget_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.maybe_emit_budget_notification(
  _user_id UUID, _project_id UUID, _scope TEXT, _usage NUMERIC, _limit NUMERIC
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pct NUMERIC; _kind TEXT; _threshold INTEGER; _exists BOOLEAN;
BEGIN
  IF _limit IS NULL OR _limit <= 0 THEN RETURN; END IF;
  _pct := (_usage / _limit) * 100;
  IF _pct >= 100 THEN _kind := 'blocked'; _threshold := 100;
  ELSIF _pct >= 80 THEN _kind := 'warning'; _threshold := 80;
  ELSE RETURN; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.budget_notifications
    WHERE user_id = _user_id
      AND COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_project_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND kind = _kind AND scope = _scope
      AND created_at >= date_trunc('day', now())
  ) INTO _exists;
  IF _exists THEN RETURN; END IF;

  INSERT INTO public.budget_notifications(user_id, project_id, scope, kind, threshold_pct, usage_usd, limit_usd, message)
  VALUES (
    _user_id, _project_id, _scope, _kind, _threshold, _usage, _limit,
    CASE
      WHEN _kind = 'blocked' AND _scope = 'user' THEN 'Budget mensuel atteint — Elena est en pause jusqu''au prochain mois.'
      WHEN _kind = 'blocked' AND _scope = 'project' THEN 'Budget projet atteint — ce projet est mis en pause.'
      WHEN _kind = 'warning' AND _scope = 'user' THEN 'Tu as utilisé 80% de ton budget mensuel Elena.'
      ELSE 'Ce projet a utilisé 80% de son budget mensuel.'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_budget_after_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_usage NUMERIC; _user_limit NUMERIC;
  _project_id UUID; _project_usage NUMERIC; _project_limit NUMERIC;
BEGIN
  IF NEW.role <> 'assistant' OR COALESCE(NEW.cost_usd, 0) = 0 THEN RETURN NEW; END IF;

  SELECT monthly_hard_limit_usd INTO _user_limit FROM public.user_quotas WHERE user_id = NEW.owner_id;
  IF _user_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(cost_usd), 0) INTO _user_usage
      FROM public.messages
      WHERE owner_id = NEW.owner_id AND created_at >= date_trunc('month', now());
    PERFORM public.maybe_emit_budget_notification(NEW.owner_id, NULL, 'user', _user_usage, _user_limit);
  END IF;

  SELECT c.project_id INTO _project_id FROM public.conversations c WHERE c.id = NEW.conversation_id;
  IF _project_id IS NOT NULL THEN
    SELECT monthly_hard_limit_usd INTO _project_limit FROM public.project_quotas WHERE project_id = _project_id;
    IF _project_limit IS NOT NULL THEN
      SELECT COALESCE(SUM(m.cost_usd), 0) INTO _project_usage
        FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
        WHERE c.project_id = _project_id AND m.created_at >= date_trunc('month', now());
      PERFORM public.maybe_emit_budget_notification(NEW.owner_id, _project_id, 'project', _project_usage, _project_limit);
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_budget_after_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_budget_after_message();

CREATE OR REPLACE FUNCTION public.mark_budget_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count INTEGER;
BEGIN
  UPDATE public.budget_notifications SET read_at = now()
   WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_budget_status(_project_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _usage NUMERIC; _limit NUMERIC; _draft BOOLEAN; _hard_block BOOLEAN; _is_owner BOOLEAN;
BEGIN
  SELECT (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)), p.draft_mode
    INTO _is_owner, _draft FROM public.projects p WHERE p.id = _project_id;
  IF NOT COALESCE(_is_owner, false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT monthly_hard_limit_usd, hard_block INTO _limit, _hard_block
    FROM public.project_quotas WHERE project_id = _project_id;

  SELECT COALESCE(SUM(m.cost_usd), 0) INTO _usage
    FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.project_id = _project_id AND m.created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'usage', _usage, 'limit', _limit,
    'has_quota', _limit IS NOT NULL,
    'pct', CASE WHEN _limit IS NULL OR _limit = 0 THEN 0 ELSE ROUND((_usage / _limit) * 100, 1) END,
    'draft_mode', COALESCE(_draft, false),
    'hard_block', COALESCE(_hard_block, false)
  );
END;
$$;
