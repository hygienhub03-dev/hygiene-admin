-- Migration 4: Referral Tokens
-- Creates: referral_tokens table
-- Tracks referral links and attribution windows

-- =========================================================================
-- 1. REFERRAL TOKENS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.referral_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  cookie_name     text NOT NULL DEFAULT 'hh_ref',
  max_age_days    int NOT NULL DEFAULT 30,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_tokens_code
  ON public.referral_tokens (code);
CREATE INDEX IF NOT EXISTS idx_referral_tokens_distributor
  ON public.referral_tokens (distributor_id);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.referral_tokens ENABLE ROW LEVEL SECURITY;

-- Partners can read own tokens
DROP POLICY IF EXISTS referral_tokens_select_own ON public.referral_tokens;
CREATE POLICY referral_tokens_select_own ON public.referral_tokens
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());
