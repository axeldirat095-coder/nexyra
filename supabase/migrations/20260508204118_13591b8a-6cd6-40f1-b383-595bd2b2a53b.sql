
-- Table waitlist
CREATE TABLE IF NOT EXISTS public.waitlist_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'landing',
  referrer TEXT,
  locale TEXT DEFAULT 'fr',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON public.waitlist_subscribers (lower(email));
CREATE INDEX IF NOT EXISTS waitlist_created_idx ON public.waitlist_subscribers (created_at DESC);

ALTER TABLE public.waitlist_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_subscribe" ON public.waitlist_subscribers;
CREATE POLICY "anyone_can_subscribe"
  ON public.waitlist_subscribers FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND char_length(email) BETWEEN 5 AND 320
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

DROP POLICY IF EXISTS "admins_read_waitlist" ON public.waitlist_subscribers;
CREATE POLICY "admins_read_waitlist"
  ON public.waitlist_subscribers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Mark capabilities done
UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = CASE title
      WHEN 'Capture email (waitlist / newsletter)' THEN 'Livré (LOT 28). Table `waitlist_subscribers` (RLS : insert public, read admin only) + composant `WaitlistForm` intégré dans le Hero. Validation email regex côté DB, dédoublonnage par lower(email).'
      WHEN 'Page comparatif (Nexyra vs Lovable / v0 / Bolt)' THEN 'Livré (LOT 28). Route `/comparison` : tableau comparatif premium Nexyra vs Lovable / v0 / Bolt avec critères clés (multi-providers BYOK, marketplace blocs, tableau de pilotage, etc.). SEO meta + OG.'
      WHEN 'Page de remerciement post-achat + onboarding guidé' THEN 'Livré (LOT 28). Route `/thank-you` : page de remerciement avec onboarding 4 étapes (clés API, premier projet, blocs, support). Anim de confettis légère via framer-motion.'
      ELSE info
    END,
    files = CASE title
      WHEN 'Capture email (waitlist / newsletter)' THEN ARRAY['src/components/marketing/WaitlistForm.tsx','src/components/Hero.tsx','supabase/migrations/lot28.sql']
      WHEN 'Page comparatif (Nexyra vs Lovable / v0 / Bolt)' THEN ARRAY['src/routes/comparison.tsx']
      WHEN 'Page de remerciement post-achat + onboarding guidé' THEN ARRAY['src/routes/thank-you.tsx']
      ELSE files
    END
WHERE title IN (
  'Capture email (waitlist / newsletter)',
  'Page comparatif (Nexyra vs Lovable / v0 / Bolt)',
  'Page de remerciement post-achat + onboarding guidé'
);
