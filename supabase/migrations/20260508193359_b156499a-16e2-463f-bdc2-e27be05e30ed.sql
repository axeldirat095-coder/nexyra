CREATE TABLE IF NOT EXISTS public.agent_run_state (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  last_plan_signature text,
  last_tool text,
  expected_next_action text,
  repeat_count integer NOT NULL DEFAULT 0,
  last_screenshot_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_run_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_run_state owner read"
ON public.agent_run_state FOR SELECT
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "agent_run_state owner write"
ON public.agent_run_state FOR ALL
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_agent_run_state_owner ON public.agent_run_state(owner_id);

CREATE OR REPLACE FUNCTION public.agent_run_state_record(
  _conversation_id uuid,
  _owner_id uuid,
  _plan_signature text,
  _last_tool text,
  _expected_next text,
  _screenshot_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.agent_run_state%ROWTYPE;
  _new_repeat integer;
BEGIN
  SELECT * INTO _existing FROM public.agent_run_state WHERE conversation_id = _conversation_id;

  IF NOT FOUND THEN
    INSERT INTO public.agent_run_state (conversation_id, owner_id, last_plan_signature, last_tool, expected_next_action, repeat_count, last_screenshot_url)
    VALUES (_conversation_id, _owner_id, _plan_signature, _last_tool, _expected_next, 0, _screenshot_url);
    RETURN jsonb_build_object('repeat_count', 0, 'is_repeat', false);
  END IF;

  IF _plan_signature IS NOT NULL AND _existing.last_plan_signature = _plan_signature THEN
    _new_repeat := _existing.repeat_count + 1;
  ELSE
    _new_repeat := 0;
  END IF;

  UPDATE public.agent_run_state
     SET last_plan_signature = _plan_signature,
         last_tool = _last_tool,
         expected_next_action = _expected_next,
         repeat_count = _new_repeat,
         last_screenshot_url = COALESCE(_screenshot_url, _existing.last_screenshot_url),
         updated_at = now()
   WHERE conversation_id = _conversation_id;

  RETURN jsonb_build_object('repeat_count', _new_repeat, 'is_repeat', _new_repeat > 0);
END;
$$;