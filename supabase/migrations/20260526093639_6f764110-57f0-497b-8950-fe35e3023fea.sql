-- feature_votes : restreindre la lecture à l'utilisateur lui-même
DROP POLICY IF EXISTS "feature_votes_public_read" ON public.feature_votes;
CREATE POLICY "feature_votes_select_own"
  ON public.feature_votes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- llm_cache : table interne, plus de lecture publique
DROP POLICY IF EXISTS "llm_cache_public_read" ON public.llm_cache;

-- prompt_cache : table interne, plus de lecture authentifiée large
DROP POLICY IF EXISTS "auth_select_cache" ON public.prompt_cache;

-- prompt_versions : table interne, plus de lecture publique
DROP POLICY IF EXISTS "prompt_versions_public_read" ON public.prompt_versions;

-- realtime.messages : exiger l'authentification pour s'abonner aux canaux
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "realtime_authenticated_only" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "realtime_authenticated_only"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (true)$p$;
  END IF;
END $$;