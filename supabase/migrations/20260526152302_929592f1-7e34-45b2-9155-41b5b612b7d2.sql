CREATE TABLE public.elena_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.elena_lessons TO authenticated;
GRANT ALL ON public.elena_lessons TO service_role;

ALTER TABLE public.elena_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_lessons" ON public.elena_lessons
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owner_insert_lessons" ON public.elena_lessons
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_update_lessons" ON public.elena_lessons
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owner_delete_lessons" ON public.elena_lessons
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_elena_lessons_active ON public.elena_lessons (is_active, priority DESC) WHERE is_active = true;

CREATE TRIGGER update_elena_lessons_updated_at
  BEFORE UPDATE ON public.elena_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();