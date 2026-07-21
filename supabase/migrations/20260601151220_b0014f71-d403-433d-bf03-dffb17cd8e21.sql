-- Table de routage IA par utilisateur
CREATE TABLE public.elena_ai_routing (
  owner_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Chaque tâche = un couple (provider, model) en texte libre pour rester flexible
  chat_provider TEXT NOT NULL DEFAULT 'openrouter',
  chat_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.5',
  code_provider TEXT NOT NULL DEFAULT 'openrouter',
  code_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.5',
  trivial_provider TEXT NOT NULL DEFAULT 'deepseek',
  trivial_model TEXT NOT NULL DEFAULT 'deepseek-chat',
  vision_provider TEXT NOT NULL DEFAULT 'openrouter',
  vision_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.5',
  image_provider TEXT NOT NULL DEFAULT 'openai',
  image_model TEXT NOT NULL DEFAULT 'gpt-image-1',
  scrape_provider TEXT NOT NULL DEFAULT 'firecrawl',
  scrape_model TEXT NOT NULL DEFAULT 'firecrawl-v1',
  reasoning_provider TEXT NOT NULL DEFAULT 'openrouter',
  reasoning_model TEXT NOT NULL DEFAULT 'openai/gpt-5',
  -- Fallback global si le provider principal tombe
  fallback_provider TEXT NOT NULL DEFAULT 'openai',
  fallback_model TEXT NOT NULL DEFAULT 'gpt-5-mini',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.elena_ai_routing TO authenticated;
GRANT ALL ON public.elena_ai_routing TO service_role;

ALTER TABLE public.elena_ai_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read routing" ON public.elena_ai_routing
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owner insert routing" ON public.elena_ai_routing
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner update routing" ON public.elena_ai_routing
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owner delete routing" ON public.elena_ai_routing
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER elena_ai_routing_touch
  BEFORE UPDATE ON public.elena_ai_routing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();