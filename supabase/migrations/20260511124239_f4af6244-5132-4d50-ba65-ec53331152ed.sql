
CREATE TABLE IF NOT EXISTS public.workspace_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  brief TEXT,
  sector TEXT,
  design_notes TEXT,
  tech_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivered_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_todos JSONB NOT NULL DEFAULT '[]'::jsonb,
  scratch JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memory_user ON public.workspace_memory(user_id);

ALTER TABLE public.workspace_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own memory" ON public.workspace_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own memory" ON public.workspace_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own memory" ON public.workspace_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own memory" ON public.workspace_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_workspace_memory()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_workspace_memory ON public.workspace_memory;
CREATE TRIGGER trg_touch_workspace_memory BEFORE UPDATE ON public.workspace_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_memory();
