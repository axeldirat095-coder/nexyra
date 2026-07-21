
-- Ajout du système d'étapes + flag fondamentale
ALTER TABLE public.elena_lessons
  ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_fundamental boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seed_key text UNIQUE;

COMMENT ON COLUMN public.elena_lessons.steps IS 'Liste ordonnée d''étapes (jsonb array of {id, text}). Si vide, fallback sur content.';
COMMENT ON COLUMN public.elena_lessons.is_fundamental IS 'Règle critique — affiche un warning avant suppression.';
COMMENT ON COLUMN public.elena_lessons.seed_key IS 'Identifiant stable pour les règles seed importées du SYSTEM_PROMPT.';
