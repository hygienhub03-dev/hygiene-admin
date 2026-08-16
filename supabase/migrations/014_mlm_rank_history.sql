-- Migration 12: Rank History
-- Creates: rank_history table for rank change audit trail

-- =========================================================================
-- 1. RANK HISTORY
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rank_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  previous_rank   text,
  new_rank        text NOT NULL,
  changed_by      uuid REFERENCES auth.users(id),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rank_history_distributor
  ON public.rank_history (distributor_id);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;

-- Partners can read own rank history
DROP POLICY IF EXISTS rank_history_select_own ON public.rank_history;
CREATE POLICY rank_history_select_own ON public.rank_history
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- No INSERT/UPDATE/DELETE for partners (admin service role only)
