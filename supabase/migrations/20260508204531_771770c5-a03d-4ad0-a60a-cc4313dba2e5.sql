
-- 1) Visibility on projects
DO $$ BEGIN
  CREATE TYPE public.project_visibility AS ENUM ('private', 'public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS visibility public.project_visibility NOT NULL DEFAULT 'private';

CREATE INDEX IF NOT EXISTS projects_visibility_idx ON public.projects (visibility);

-- 2) Plans table
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  monthly_price_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  yearly_price_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_projects INTEGER NOT NULL DEFAULT 0,
  max_ai_tokens_per_month BIGINT NOT NULL DEFAULT 0,
  max_image_generations_per_month INTEGER NOT NULL DEFAULT 0,
  max_storage_mb INTEGER NOT NULL DEFAULT 0,
  max_marketplace_blocks INTEGER NOT NULL DEFAULT 0,
  max_team_seats INTEGER NOT NULL DEFAULT 1,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read"
  ON public.plans FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "plans_admin_write" ON public.plans;
CREATE POLICY "plans_admin_write"
  ON public.plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed plans
INSERT INTO public.plans (id, name, tagline, monthly_price_eur, yearly_price_eur, max_projects, max_ai_tokens_per_month, max_image_generations_per_month, max_storage_mb, max_marketplace_blocks, max_team_seats, features, is_featured, position) VALUES
('free', 'Free', 'Pour découvrir Nexyra', 0, 0, 2, 200000, 30, 250, 5, 1, '["Elena agent (Lovable AI)", "BYOK clés perso", "Marketplace blocs (5)", "Communauté Discord"]'::jsonb, false, 0),
('pro', 'Pro', 'Pour les créateurs sérieux', 29, 290, 15, 5000000, 500, 5000, 50, 3, '["Tout Free +", "Multi-providers (10+)", "Edge functions illimitées", "Auto-QA visuelle", "Support prioritaire <24h"]'::jsonb, true, 1),
('studio', 'Studio', 'Pour les agences & équipes', 99, 990, 100, 25000000, 3000, 50000, 500, 10, '["Tout Pro +", "10 sièges équipe", "Marketplace privé", "SSO (sur demande)", "Support dédié <4h"]'::jsonb, false, 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  monthly_price_eur = EXCLUDED.monthly_price_eur,
  yearly_price_eur = EXCLUDED.yearly_price_eur,
  max_projects = EXCLUDED.max_projects,
  max_ai_tokens_per_month = EXCLUDED.max_ai_tokens_per_month,
  max_image_generations_per_month = EXCLUDED.max_image_generations_per_month,
  max_storage_mb = EXCLUDED.max_storage_mb,
  max_marketplace_blocks = EXCLUDED.max_marketplace_blocks,
  max_team_seats = EXCLUDED.max_team_seats,
  features = EXCLUDED.features,
  is_featured = EXCLUDED.is_featured,
  position = EXCLUDED.position,
  updated_at = now();

CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3) Mark capabilities done
UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = CASE title
      WHEN 'PWA installable (icône + service worker)' THEN 'Livré (LOT 29). Service worker `public/sw.js` (cache-first statiques, network-first navigations), composant `PWAInstallPrompt` montré dès que l''événement beforeinstallprompt est émis. Manifest existant (start_url /dev). Enregistrement uniquement en production.'
      WHEN 'Mode ''outil perso'' vs ''mode public'' (toggle)' THEN 'Livré (LOT 29). Colonne `projects.visibility` (enum private/public) + toggle UI dans la page /projects. Permet de basculer un projet entre app interne (équipe) et SaaS public.'
      WHEN 'Définition précise des plans (limites par plan)' THEN 'Livré (LOT 29). Table `plans` (Free, Pro, Studio) avec limites détaillées : projets max, tokens IA/mois, générations image/mois, stockage Mo, blocs marketplace, sièges équipe. RLS read public, write admin only.'
      ELSE info
    END,
    files = CASE title
      WHEN 'PWA installable (icône + service worker)' THEN ARRAY['public/sw.js','public/manifest.webmanifest','src/components/marketing/PWAInstallPrompt.tsx','src/routes/__root.tsx']
      WHEN 'Mode ''outil perso'' vs ''mode public'' (toggle)' THEN ARRAY['supabase/migrations/lot29.sql','src/components/projects/ProjectVisibilityToggle.tsx','src/routes/projects.tsx']
      WHEN 'Définition précise des plans (limites par plan)' THEN ARRAY['supabase/migrations/lot29.sql']
      ELSE files
    END
WHERE title IN (
  'PWA installable (icône + service worker)',
  'Mode ''outil perso'' vs ''mode public'' (toggle)',
  'Définition précise des plans (limites par plan)'
);
