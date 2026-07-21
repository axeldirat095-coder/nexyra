CREATE TABLE IF NOT EXISTS public.sandbox_console_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  project_id uuid NOT NULL,
  conversation_id uuid,
  level text NOT NULL CHECK (level IN ('log','info','warn','error','debug')),
  message text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_logs_project_time
  ON public.sandbox_console_logs (project_id, created_at DESC);

ALTER TABLE public.sandbox_console_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their console logs"
  ON public.sandbox_console_logs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert their console logs"
  ON public.sandbox_console_logs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete their console logs"
  ON public.sandbox_console_logs FOR DELETE
  USING (owner_id = auth.uid());