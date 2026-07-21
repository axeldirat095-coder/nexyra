-- Workspace chat persistence (Lot A — preview parity)
-- Stores Elena Workspace chat messages in DB (was localStorage-only).
-- Survives F5, cross-device, cross-browser.
CREATE TABLE IF NOT EXISTS public.workspace_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_key text NOT NULL,        -- projects.id uuid as text, OR 'default'
  client_id text NOT NULL,          -- ChatMessage.id (stable client-side id)
  position bigint NOT NULL,         -- monotonic insert order
  payload jsonb NOT NULL,           -- full ChatMessage shape
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, project_key, client_id)
);

CREATE INDEX IF NOT EXISTS idx_wcm_owner_project_pos
  ON public.workspace_chat_messages (owner_id, project_key, position);

ALTER TABLE public.workspace_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wcm_owner_select" ON public.workspace_chat_messages
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "wcm_owner_insert" ON public.workspace_chat_messages
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wcm_owner_update" ON public.workspace_chat_messages
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wcm_owner_delete" ON public.workspace_chat_messages
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER trg_wcm_updated_at
  BEFORE UPDATE ON public.workspace_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();