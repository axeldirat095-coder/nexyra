
CREATE TABLE public.elena_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  conversation_id TEXT,
  endpoint TEXT NOT NULL,
  task_type TEXT,
  model TEXT,
  cache_type TEXT,
  prompt_name TEXT,
  prompt_version INTEGER,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_elena_metrics_user_created ON public.elena_metrics (user_id, created_at DESC);
CREATE INDEX idx_elena_metrics_created ON public.elena_metrics (created_at DESC);
CREATE INDEX idx_elena_metrics_endpoint_created ON public.elena_metrics (endpoint, created_at DESC);

ALTER TABLE public.elena_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own metrics"
ON public.elena_metrics
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins see all metrics"
ON public.elena_metrics
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

UPDATE public.capabilities
SET status = 'done', completed_at = now(), updated_at = now()
WHERE category_id = 'elena-v3' AND title = 'Axe D — Prompts versionnés + few-shot premium';

UPDATE public.capabilities
SET status = 'done', completed_at = now(), updated_at = now()
WHERE category_id = 'elena-v3' AND title = 'Axe E — Observabilité branchée (latence/tokens/accept rate)';
