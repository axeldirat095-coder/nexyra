
-- Enum : type d'authentification supporté
CREATE TYPE public.integration_auth_type AS ENUM (
  'oauth2',
  'api_key',
  'bearer',
  'basic',
  'webhook',
  'none'
);

-- Enum : catégorie d'intégration (pour grouper dans l'UI)
CREATE TYPE public.integration_category AS ENUM (
  'communication',
  'productivity',
  'crm',
  'payment',
  'marketing',
  'social',
  'storage',
  'analytics',
  'developer',
  'ai',
  'calendar',
  'email',
  'forms',
  'other'
);

-- Enum : statut d'une intégration sur un projet
CREATE TYPE public.project_integration_status AS ENUM (
  'pending',
  'active',
  'expired',
  'error',
  'revoked'
);

-- =====================================================
-- TABLE 1 : integration_catalog
-- Bibliothèque publique des services connectables
-- =====================================================
CREATE TABLE public.integration_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  icon text,
  category public.integration_category NOT NULL DEFAULT 'other',
  auth_type public.integration_auth_type NOT NULL,

  -- Doc & endpoints
  homepage_url text,
  docs_url text,
  api_base_url text,
  openapi_url text,

  -- OAuth specifics (NULL pour les autres types)
  oauth_authorize_url text,
  oauth_token_url text,
  oauth_default_scopes text[],

  -- Secrets requis dans le projet (ex: ['STRIPE_SECRET_KEY'])
  required_secrets text[] NOT NULL DEFAULT '{}',

  -- Exemples & hints pour Elena (génération de code)
  usage_example text,
  common_actions jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Méta
  is_vip boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  popularity int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_catalog_category ON public.integration_catalog(category) WHERE is_active;
CREATE INDEX idx_integration_catalog_vip ON public.integration_catalog(is_vip) WHERE is_active;
CREATE INDEX idx_integration_catalog_slug_search ON public.integration_catalog USING gin (to_tsvector('simple', name || ' ' || description));

ALTER TABLE public.integration_catalog ENABLE ROW LEVEL SECURITY;

-- Lecture publique du catalogue actif
CREATE POLICY "Catalog is readable by everyone authenticated"
  ON public.integration_catalog FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Seuls les admins peuvent modifier le catalogue
CREATE POLICY "Only admins can insert catalog entries"
  ON public.integration_catalog FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can update catalog entries"
  ON public.integration_catalog FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can delete catalog entries"
  ON public.integration_catalog FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_integration_catalog_updated_at
  BEFORE UPDATE ON public.integration_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- TABLE 2 : project_integrations
-- Instances actives d'intégration par projet
-- =====================================================
CREATE TABLE public.project_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.integration_catalog(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL,
  org_id uuid NOT NULL,

  status public.project_integration_status NOT NULL DEFAULT 'pending',

  -- Identifiant côté tiers (ex: email du compte connecté, workspace ID)
  account_label text,
  granted_scopes text[],

  -- Statistiques d'usage
  calls_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  last_error text,
  expires_at timestamptz,

  -- Configuration libre (sans jamais stocker de secret en clair)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(project_id, catalog_id, account_label)
);

CREATE INDEX idx_project_integrations_project ON public.project_integrations(project_id);
CREATE INDEX idx_project_integrations_owner ON public.project_integrations(owner_id);
CREATE INDEX idx_project_integrations_status ON public.project_integrations(status);

ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;

-- Le propriétaire du projet voit ses intégrations
CREATE POLICY "Owner can view their project integrations"
  ON public.project_integrations FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Owner can create project integrations"
  ON public.project_integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update their project integrations"
  ON public.project_integrations FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Owner can delete their project integrations"
  ON public.project_integrations FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trg_project_integrations_updated_at
  BEFORE UPDATE ON public.project_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
