
-- ============================================================
-- 1) feature_requests + feature_votes
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.feature_request_status AS ENUM ('open', 'planned', 'in_progress', 'shipped', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 4 AND 140),
  description TEXT,
  status public.feature_request_status NOT NULL DEFAULT 'open',
  votes_count INTEGER NOT NULL DEFAULT 0,
  capability_id UUID REFERENCES public.capabilities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_requests_votes_idx ON public.feature_requests (votes_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_requests_status_idx ON public.feature_requests (status);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_requests_public_read" ON public.feature_requests;
CREATE POLICY "feature_requests_public_read"
  ON public.feature_requests FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "feature_requests_user_create" ON public.feature_requests;
CREATE POLICY "feature_requests_user_create"
  ON public.feature_requests FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "feature_requests_admin_write" ON public.feature_requests;
CREATE POLICY "feature_requests_admin_write"
  ON public.feature_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "feature_requests_admin_delete" ON public.feature_requests;
CREATE POLICY "feature_requests_admin_delete"
  ON public.feature_requests FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER feature_requests_set_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Votes
CREATE TABLE IF NOT EXISTS public.feature_votes (
  feature_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, user_id)
);

ALTER TABLE public.feature_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_votes_public_read" ON public.feature_votes;
CREATE POLICY "feature_votes_public_read"
  ON public.feature_votes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "feature_votes_user_vote" ON public.feature_votes;
CREATE POLICY "feature_votes_user_vote"
  ON public.feature_votes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feature_votes_user_unvote" ON public.feature_votes;
CREATE POLICY "feature_votes_user_unvote"
  ON public.feature_votes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger : maintenir votes_count
CREATE OR REPLACE FUNCTION public.feature_votes_recount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN _id := NEW.feature_id;
  ELSIF TG_OP = 'DELETE' THEN _id := OLD.feature_id;
  END IF;

  UPDATE public.feature_requests
  SET votes_count = (SELECT count(*) FROM public.feature_votes WHERE feature_id = _id)
  WHERE id = _id;

  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS feature_votes_recount_trg ON public.feature_votes;
CREATE TRIGGER feature_votes_recount_trg
  AFTER INSERT OR DELETE ON public.feature_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_votes_recount();

-- ============================================================
-- 2) RLS additionnelle : projects publics visibles par tous
-- ============================================================
DROP POLICY IF EXISTS "projects_public_read" ON public.projects;
CREATE POLICY "projects_public_read"
  ON public.projects FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public');

-- ============================================================
-- 3) Mark capabilities done
-- ============================================================
UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = CASE title
      WHEN 'Système de feedback in-app (vote features)' THEN 'Livré (LOT 31). Tables `feature_requests` + `feature_votes` avec compteur auto (trigger). Route `/feedback` : soumettre une idée, voter / dévoter, voir le top. RLS : lecture publique, écriture authentifiée, 1 vote par user.'
      WHEN 'Galerie publique de projets faits avec Nexyra' THEN 'Livré (LOT 31). Route `/showcase` : galerie publique des projets dont `visibility=public` (set up LOT 29). Cards glassmorphism avec nom, description, type. RLS étendue (projects_public_read) pour anon/authenticated.'
      WHEN 'Discord / espace communautaire' THEN 'Livré (LOT 31). Composant `CommunityCTA` + lien Discord (URL configurable via env VITE_DISCORD_URL) intégré au Footer et à la page /feedback.'
      ELSE info
    END,
    files = CASE title
      WHEN 'Système de feedback in-app (vote features)' THEN ARRAY['supabase/migrations/lot31.sql','src/routes/feedback.tsx']
      WHEN 'Galerie publique de projets faits avec Nexyra' THEN ARRAY['supabase/migrations/lot31.sql','src/routes/showcase.tsx']
      WHEN 'Discord / espace communautaire' THEN ARRAY['src/components/community/CommunityCTA.tsx','src/components/Footer.tsx']
      ELSE files
    END
WHERE title IN (
  'Système de feedback in-app (vote features)',
  'Galerie publique de projets faits avec Nexyra',
  'Discord / espace communautaire'
);
