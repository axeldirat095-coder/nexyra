CREATE TABLE IF NOT EXISTS public.lighthouse_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  url text NOT NULL,
  performance int,
  accessibility int,
  best_practices int,
  seo int,
  overall int,
  strategy text NOT NULL DEFAULT 'mobile',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lighthouse_runs_owner ON public.lighthouse_runs(owner_id, created_at DESC);
ALTER TABLE public.lighthouse_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lh owner read" ON public.lighthouse_runs FOR SELECT
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "lh owner insert" ON public.lighthouse_runs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.purge_old_lighthouse_runs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.lighthouse_runs WHERE created_at < now() - INTERVAL '90 days';
$$;

INSERT INTO public.tool_pricing (tool_name, credits_cost, category, description, requires_byok, enabled_by_default) VALUES
  ('lighthouse_ci', 2, 'quality', 'Audit Lighthouse + persistance historique', false, true),
  ('sentry_autoinstrument', 1, 'quality', 'Injecte Sentry dans le projet utilisateur', false, true)
ON CONFLICT (tool_name) DO UPDATE SET description=EXCLUDED.description, updated_at=now();