
-- Lot 6 — Templates projet sectoriels
CREATE TABLE IF NOT EXISTS public.project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  sector TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  ideal_for TEXT,
  pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  block_slugs TEXT[] NOT NULL DEFAULT '{}',
  features TEXT[] NOT NULL DEFAULT '{}',
  design_notes TEXT,
  popularity INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_templates_sector ON public.project_templates(sector) WHERE is_active;

ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates lisibles par tout user authentifié"
  ON public.project_templates FOR SELECT TO authenticated USING (is_active = true);

CREATE OR REPLACE FUNCTION public.list_project_templates(
  p_sector TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  slug TEXT, sector TEXT, title TEXT, description TEXT,
  ideal_for TEXT, features TEXT[], pages JSONB,
  block_slugs TEXT[], popularity INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.slug, t.sector, t.title, t.description, t.ideal_for,
         t.features, t.pages, t.block_slugs, t.popularity
  FROM public.project_templates t
  WHERE t.is_active = true
    AND (p_sector IS NULL OR t.sector = p_sector)
  ORDER BY t.popularity DESC, t.title ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.record_template_usage(p_slug TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.project_templates SET popularity = popularity + 1 WHERE slug = p_slug;
$$;

GRANT EXECUTE ON FUNCTION public.list_project_templates(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_template_usage(TEXT) TO authenticated;
