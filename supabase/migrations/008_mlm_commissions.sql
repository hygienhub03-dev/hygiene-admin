-- Migration 6: Commissions (Redesigned)
-- Creates: commissions table with snapshot columns, idempotency, calc_version
-- Commission states: pending → available → reversed

-- =========================================================================
-- 1. COMMISSIONS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.commissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  earner_id             uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  source_order_id       uuid,
  from_user_id          uuid,
  level                 int NOT NULL CHECK (level >= 1),
  type                  text NOT NULL DEFAULT 'unilevel'
                          CHECK (type IN ('retail', 'unilevel', 'rank_bonus', 'adjustment')),
  amount_zar            numeric(12,2) NOT NULL CHECK (amount_zar >= 0),
  rate_used             numeric(5,4),
  volume_zar            numeric(12,2),
  rule_id               uuid,
  earner_rank_at_time   text,
  buyer_rank_at_time    text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'available', 'reversed')),
  approved_at           timestamptz,
  approved_by           uuid,
  reversal_of           uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  calc_version          int NOT NULL DEFAULT 1,
  note                  text,
  idempotency_key       text UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_earner
  ON public.commissions (earner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status
  ON public.commissions (status);
CREATE INDEX IF NOT EXISTS idx_commissions_order
  ON public.commissions (source_order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_reversal_of
  ON public.commissions (reversal_of);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Partners can read own commissions
DROP POLICY IF EXISTS commissions_select_own ON public.commissions;
CREATE POLICY commissions_select_own ON public.commissions
  FOR SELECT TO authenticated
  USING (earner_id = auth.uid());

-- No INSERT/UPDATE/DELETE for partners (via RPC functions only)
