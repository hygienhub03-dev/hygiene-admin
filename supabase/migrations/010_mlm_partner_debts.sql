-- Migration 8: Partner Debts
-- Creates: partner_debts table
-- Tracks outstanding debts when commission clawback exceeds wallet balance

-- =========================================================================
-- 1. PARTNER DEBTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.partner_debts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id      uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  commission_id       uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  original_amount_zar numeric(12,2) NOT NULL CHECK (original_amount_zar > 0),
  outstanding_zar     numeric(12,2) NOT NULL CHECK (outstanding_zar >= 0),
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'outstanding'
                        CHECK (status IN ('outstanding', 'partially_settled', 'settled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  settled_at          timestamptz,

  CONSTRAINT debt_outstanding_lte_original
    CHECK (outstanding_zar <= original_amount_zar)
);

CREATE INDEX IF NOT EXISTS idx_debts_distributor
  ON public.partner_debts (distributor_id);
CREATE INDEX IF NOT EXISTS idx_debts_status
  ON public.partner_debts (status)
  WHERE status != 'settled';

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.partner_debts ENABLE ROW LEVEL SECURITY;

-- Partners can read own debts
DROP POLICY IF EXISTS debts_select_own ON public.partner_debts;
CREATE POLICY debts_select_own ON public.partner_debts
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- No INSERT/UPDATE/DELETE for partners (admin service role only)
