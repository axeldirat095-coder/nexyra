
CREATE TYPE public.block_category AS ENUM (
  'landing', 'dashboard', 'auth', 'commerce', 'forms', 'navigation', 'footer', 'feedback', 'data_display', 'sectoriel'
);

CREATE TYPE public.block_sector AS ENUM (
  'generic', 'saas', 'restaurant', 'real_estate', 'portfolio', 'ecommerce', 'events', 'blog', 'fitness', 'education', 'agency'
);

CREATE TABLE public.code_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  category public.block_category NOT NULL,
  sector public.block_sector NOT NULL DEFAULT 'generic',
  title text NOT NULL,
  description text NOT NULL,
  code text NOT NULL,
  dependencies text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  preview_url text,
  popularity integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  search_tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_code_blocks_search ON public.code_blocks USING GIN(search_tsv);
CREATE INDEX idx_code_blocks_tags ON public.code_blocks USING GIN(tags);
CREATE INDEX idx_code_blocks_category ON public.code_blocks(category, sector) WHERE is_active = true;

ALTER TABLE public.code_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "code_blocks_public_read"
ON public.code_blocks FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Trigger pour maintenir search_tsv (to_tsvector n'est pas immutable, on ne peut pas le mettre en colonne générée)
CREATE OR REPLACE FUNCTION public.code_blocks_update_tsv()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.tags, '{}'), ' ')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_code_blocks_tsv
BEFORE INSERT OR UPDATE OF title, description, tags
ON public.code_blocks
FOR EACH ROW EXECUTE FUNCTION public.code_blocks_update_tsv();

CREATE TRIGGER trg_code_blocks_updated_at
BEFORE UPDATE ON public.code_blocks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.search_code_blocks(
  _query text DEFAULT NULL,
  _category public.block_category DEFAULT NULL,
  _sector public.block_sector DEFAULT NULL,
  _limit integer DEFAULT 10
)
RETURNS TABLE (
  slug text,
  category public.block_category,
  sector public.block_sector,
  title text,
  description text,
  tags text[],
  dependencies text[],
  popularity integer,
  rank real
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH q AS (
    SELECT CASE
      WHEN _query IS NULL OR length(trim(_query)) = 0 THEN NULL
      ELSE plainto_tsquery('french', _query)
    END AS tsq
  )
  SELECT b.slug, b.category, b.sector, b.title, b.description, b.tags, b.dependencies, b.popularity,
    (
      CASE WHEN (SELECT tsq FROM q) IS NULL THEN 0
           ELSE ts_rank(b.search_tsv, (SELECT tsq FROM q)) * 4
      END
      + (b.popularity::real / 100.0)
      + CASE WHEN _category IS NOT NULL AND b.category = _category THEN 2 ELSE 0 END
      + CASE WHEN _sector IS NOT NULL AND b.sector = _sector THEN 1.5 ELSE 0 END
    )::real AS rank
  FROM public.code_blocks b
  WHERE b.is_active = true
    AND (_category IS NULL OR b.category = _category)
    AND (_sector IS NULL OR b.sector = _sector OR b.sector = 'generic')
    AND ((SELECT tsq FROM q) IS NULL OR b.search_tsv @@ (SELECT tsq FROM q))
  ORDER BY rank DESC, b.popularity DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

CREATE OR REPLACE FUNCTION public.record_block_usage(_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.code_blocks SET popularity = popularity + 1 WHERE slug = _slug;
$$;

REVOKE EXECUTE ON FUNCTION public.search_code_blocks(text, public.block_category, public.block_sector, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_code_blocks(text, public.block_category, public.block_sector, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.record_block_usage(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_block_usage(text) TO authenticated, service_role;
