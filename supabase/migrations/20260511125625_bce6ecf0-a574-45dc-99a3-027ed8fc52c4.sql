CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version int NOT NULL,
  content text NOT NULL,
  few_shots jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_active
  ON public.prompt_versions (name) WHERE is_active = true;

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_versions_public_read" ON public.prompt_versions
  FOR SELECT TO anon, authenticated USING (true);

-- Garantie : un seul actif par name
CREATE OR REPLACE FUNCTION public.enforce_single_active_prompt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.prompt_versions
       SET is_active = false
     WHERE name = NEW.name AND id <> NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_prompt ON public.prompt_versions;
CREATE TRIGGER trg_single_active_prompt
  BEFORE INSERT OR UPDATE ON public.prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_prompt();

-- Seed v1 du workspace : few-shots minimaux mais ciblés (pattern template-first + memory_append)
INSERT INTO public.prompt_versions (name, version, content, few_shots, is_active, notes)
VALUES (
  'elena-workspace',
  1,
  '__USE_CONST__',
  '[
    {
      "user": "Crée-moi un site pour un restaurant italien à Lyon.",
      "assistant": "Je commence par chercher un template restaurant : list_templates({sector:\"restaurant\"}) → get_template du meilleur match → get_block pour chaque slug → write_file des pages qui composent les blocs (textes adaptés Lyon/italien) → câblage src/App.tsx → read_logs + delegate_qa_visual. Je termine par memory_append({delivered_files:[...], tech_decisions:[\"template restaurant v1\"]})."
    },
    {
      "user": "Ajoute une section pricing premium.",
      "assistant": "Workflow blocs-first : search_blocks({category:\"pricing\"}) → get_block du meilleur match → write_file en adaptant titres/prix → edit_file src/App.tsx pour monter la section → read_logs (vert ?) → delegate_qa_visual avec le code écrit → fix si FIX → memory_append delivered_files + open_todos."
    }
  ]'::jsonb,
  true,
  'v1 — extrait du SYSTEM_PROMPT inline (placeholder __USE_CONST__ : le serveur fallback sur la constante si content vaut cette sentinelle).'
);

-- Marquer Axe D started
UPDATE public.capabilities
SET status='in_progress', started_at=now()
WHERE id='b2c849c5-43a6-40b3-b052-2dcd388df890';