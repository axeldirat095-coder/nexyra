
CREATE TABLE public.agent_cancellations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  cancelled_by UUID NOT NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  consumed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_agent_cancellations_conv ON public.agent_cancellations(conversation_id, cancelled_at DESC);

ALTER TABLE public.agent_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_insert_cancellation"
ON public.agent_cancellations FOR INSERT TO authenticated
WITH CHECK (
  cancelled_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = agent_cancellations.conversation_id
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "owner_select_cancellation"
ON public.agent_cancellations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = agent_cancellations.conversation_id
      AND c.owner_id = auth.uid()
  )
);

-- Helper function appelée côté serveur (service role) pour vérifier annulation
CREATE OR REPLACE FUNCTION public.is_agent_cancelled(_conversation_id UUID, _since TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_cancellations
    WHERE conversation_id = _conversation_id
      AND cancelled_at >= _since
      AND consumed_at IS NULL
  );
$$;
