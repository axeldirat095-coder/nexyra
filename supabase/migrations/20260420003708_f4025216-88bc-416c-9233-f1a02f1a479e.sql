-- Enum pour le statut des capacités
CREATE TYPE public.capability_status AS ENUM ('todo', 'in_progress', 'done');

-- Enum pour la priorité
CREATE TYPE public.capability_priority AS ENUM ('P0', 'P1', 'P2');

-- Enum pour l'effort
CREATE TYPE public.capability_effort AS ENUM ('S', 'M', 'L', 'XL');

-- Table des capacités (roadmap publique de Nexyra)
CREATE TABLE public.capabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id TEXT NOT NULL,
  category_label TEXT NOT NULL,
  category_icon TEXT NOT NULL,
  category_vision TEXT,
  title TEXT NOT NULL,
  info TEXT NOT NULL,
  status public.capability_status NOT NULL DEFAULT 'todo',
  priority public.capability_priority NOT NULL DEFAULT 'P1',
  effort public.capability_effort NOT NULL DEFAULT 'M',
  files TEXT[] NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour tri rapide
CREATE INDEX idx_capabilities_category ON public.capabilities(category_id, position);
CREATE INDEX idx_capabilities_status ON public.capabilities(status);
CREATE INDEX idx_capabilities_priority ON public.capabilities(priority);

-- RLS : lecture publique (roadmap transparente), écriture verrouillée (admin via service role uniquement)
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_capabilities"
ON public.capabilities
FOR SELECT
TO anon, authenticated
USING (true);

-- Trigger updated_at
CREATE TRIGGER capabilities_set_updated_at
BEFORE UPDATE ON public.capabilities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.capabilities;
ALTER TABLE public.capabilities REPLICA IDENTITY FULL;