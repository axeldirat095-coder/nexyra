CREATE TABLE public.webhook_custom_tools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  auth_kind TEXT NOT NULL DEFAULT 'none',
  auth_token TEXT,
  auth_header_name TEXT,
  body_template JSONB,
  parameters_schema JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

ALTER TABLE public.webhook_custom_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own webhook tools" ON public.webhook_custom_tools
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_webhook_custom_tools_updated
BEFORE UPDATE ON public.webhook_custom_tools
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.tool_pricing (tool_name, category, provider, credits_cost, requires_byok, enabled_by_default, description)
VALUES
  ('webhook_register', 'automation', 'nexyra', 0, false, true, 'Register a custom webhook as an Elena tool'),
  ('webhook_list', 'automation', 'nexyra', 0, false, true, 'List user webhook tools'),
  ('webhook_call', 'automation', 'nexyra', 1, false, true, 'Invoke a registered webhook tool'),
  ('webhook_delete', 'automation', 'nexyra', 0, false, true, 'Remove a webhook tool'),
  ('secret_set', 'platform', 'nexyra', 0, false, true, 'Trigger UI dialog asking the user to set a secret value')
ON CONFLICT (tool_name) DO NOTHING;

UPDATE public.capabilities
SET status = 'done',
    completed_at = COALESCE(completed_at, now()),
    info = COALESCE(info, '') || E'\n[done] Implémenté.'
WHERE id IN (
  '3cde6505-72f7-4f86-a3ad-f797f0bd1971',
  'f4ed5047-8c3f-420e-9fe3-a67955d1b257',
  '639cf230-31bf-4ef5-9e3b-65b28db8012c',
  '68d7d22b-48d8-41fb-8c01-520f412c113e'
);