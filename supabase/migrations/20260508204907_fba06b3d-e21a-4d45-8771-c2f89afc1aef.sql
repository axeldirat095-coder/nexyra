
-- ============================================================
-- 1) project_cost_estimates : coûts agrégés par projet
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_cost_estimates (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  ai_tokens_input BIGINT NOT NULL DEFAULT 0,
  ai_tokens_output BIGINT NOT NULL DEFAULT 0,
  ai_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  image_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  video_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  storage_mb NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost_eur NUMERIC(12,4) NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pce_owner_idx ON public.project_cost_estimates (owner_id);

ALTER TABLE public.project_cost_estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_costs" ON public.project_cost_estimates;
CREATE POLICY "owner_read_costs"
  ON public.project_cost_estimates FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- (writes via service role / triggers / agent backend uniquement)

-- ============================================================
-- 2) Crédits : solde + transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id UUID PRIMARY KEY,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  lifetime_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
  lifetime_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_credits" ON public.user_credits;
CREATE POLICY "user_read_own_credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DO $$ BEGIN
  CREATE TYPE public.credit_tx_kind AS ENUM ('purchase', 'spend', 'bonus', 'refund', 'expiration');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind public.credit_tx_kind NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  reason TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_tx_user_idx ON public.credit_transactions (user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_tx" ON public.credit_transactions;
CREATE POLICY "user_read_own_tx"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- RPC sécurisée : créditer / débiter un user (service-side)
CREATE OR REPLACE FUNCTION public.apply_credit_transaction(
  _user_id UUID,
  _kind public.credit_tx_kind,
  _amount NUMERIC,
  _reason TEXT DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance NUMERIC(14,2);
  _signed NUMERIC(14,2);
BEGIN
  -- spend / expiration / refund-débit = négatif ; purchase / bonus = positif
  IF _kind IN ('spend','expiration') THEN _signed := -ABS(_amount);
  ELSIF _kind = 'refund' THEN _signed := ABS(_amount);
  ELSE _signed := ABS(_amount);
  END IF;

  INSERT INTO public.user_credits (user_id, balance, lifetime_earned, lifetime_spent)
  VALUES (
    _user_id,
    _signed,
    GREATEST(_signed, 0),
    GREATEST(-_signed, 0)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = public.user_credits.balance + _signed,
    lifetime_earned = public.user_credits.lifetime_earned + GREATEST(_signed, 0),
    lifetime_spent = public.user_credits.lifetime_spent + GREATEST(-_signed, 0),
    updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_transactions (user_id, kind, amount, balance_after, reason, reference_id, metadata)
  VALUES (_user_id, _kind, ABS(_amount), _new_balance, _reason, _reference_id, COALESCE(_metadata, '{}'::jsonb));

  RETURN _new_balance;
END
$$;

REVOKE ALL ON FUNCTION public.apply_credit_transaction(UUID, public.credit_tx_kind, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC;

-- ============================================================
-- 3) block_usage_events : télémetrie marketplace blocs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.block_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_slug TEXT NOT NULL,
  user_id UUID,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  event TEXT NOT NULL DEFAULT 'insert',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bue_block_idx ON public.block_usage_events (block_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS bue_user_idx ON public.block_usage_events (user_id, created_at DESC);

ALTER TABLE public.block_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_can_log_block_usage" ON public.block_usage_events;
CREATE POLICY "user_can_log_block_usage"
  ON public.block_usage_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "user_read_own_block_usage" ON public.block_usage_events;
CREATE POLICY "user_read_own_block_usage"
  ON public.block_usage_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 4) Mark capabilities done
-- ============================================================
UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = CASE title
      WHEN 'Estimations coûts par app utilisateur' THEN 'Livré (LOT 30). Table `project_cost_estimates` agrège par projet : tokens IA in/out, coût IA $, images, vidéos, stockage Mo, total EUR. Composant `ProjectCostBadge` affiche le coût courant. Alimentation par les hooks observability + agent backend.'
      WHEN 'Système de crédits (alternative ou complément abonnement)' THEN 'Livré (LOT 30). Tables `user_credits` (solde + lifetime) et `credit_transactions` (historique purchase/spend/bonus/refund/expiration) avec RPC sécurisée `apply_credit_transaction`. UI `CreditsBalance` dans Settings.'
      WHEN 'Telemetry usage par bloc' THEN 'Livré (LOT 30). Table `block_usage_events` (block_slug, user_id, project_id, event, metadata). Helper `logBlockUsage()` côté front. Permet de classer les blocs marketplace par popularité réelle.'
      ELSE info
    END,
    files = CASE title
      WHEN 'Estimations coûts par app utilisateur' THEN ARRAY['supabase/migrations/lot30.sql','src/components/projects/ProjectCostBadge.tsx']
      WHEN 'Système de crédits (alternative ou complément abonnement)' THEN ARRAY['supabase/migrations/lot30.sql','src/components/credits/CreditsBalance.tsx']
      WHEN 'Telemetry usage par bloc' THEN ARRAY['supabase/migrations/lot30.sql','src/lib/blockTelemetry.ts']
      ELSE files
    END
WHERE title IN (
  'Estimations coûts par app utilisateur',
  'Système de crédits (alternative ou complément abonnement)',
  'Telemetry usage par bloc'
);
