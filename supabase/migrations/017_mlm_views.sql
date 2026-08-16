-- Migration 15: Views + Reconciliation Functions
-- Creates: v_distributor_stats view, rebuild_closure_table, verify_wallet_balance

-- =========================================================================
-- 1. VIEW: DISTRIBUTOR STATS
-- =========================================================================
CREATE OR REPLACE VIEW public.v_distributor_stats AS
SELECT
  d.id AS distributor_id,
  d.referral_code,
  d.rank,
  d.status,
  (SELECT count(*) FROM public.distributor_closure c
    WHERE c.ancestor_id = d.id AND c.depth = 1) AS direct_count,
  (SELECT count(*) FROM public.distributor_closure c
    WHERE c.ancestor_id = d.id AND c.depth > 0) AS team_count,
  COALESCE(w.balance_zar, 0) AS balance_zar,
  COALESCE(w.reserved_zar, 0) AS reserved_zar,
  COALESCE(w.balance_zar, 0) - COALESCE(w.reserved_zar, 0) AS available_zar,
  COALESCE(w.lifetime_earned_zar, 0) AS lifetime_earned_zar,
  COALESCE(w.lifetime_paid_zar, 0) AS lifetime_paid_zar,
  COALESCE(w.lifetime_reversed_zar, 0) AS lifetime_reversed_zar,
  (SELECT count(*) FROM public.partner_debts pd
    WHERE pd.distributor_id = d.id AND pd.status != 'settled') AS active_debts,
  (SELECT COALESCE(SUM(pd.outstanding_zar), 0) FROM public.partner_debts pd
    WHERE pd.distributor_id = d.id AND pd.status != 'settled') AS total_debt_zar
FROM public.distributors d
LEFT JOIN public.wallets w ON w.distributor_id = d.id;

GRANT SELECT ON public.v_distributor_stats TO authenticated;

-- =========================================================================
-- 2. REBUILD CLOSURE TABLE
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rebuild_closure_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear existing closure data
  TRUNCATE public.distributor_closure;

  -- Rebuild from scratch using recursive CTE
  INSERT INTO public.distributor_closure (ancestor_id, descendant_id, depth)
  WITH RECURSIVE tree AS (
    -- Self-rows (depth 0)
    SELECT id AS ancestor_id, id AS descendant_id, 0 AS depth
    FROM public.distributors

    UNION ALL

    -- Inherit from parent
    SELECT t.ancestor_id, d.id, t.depth + 1
    FROM tree t
    JOIN public.distributors d ON d.sponsor_id = t.descendant_id
    WHERE t.depth < 100  -- safety limit
  )
  SELECT ancestor_id, descendant_id, depth FROM tree
  ON CONFLICT DO NOTHING;
END;
$$;

-- =========================================================================
-- 3. VERIFY WALLET BALANCE
-- Returns any wallets where cached balance disagrees with ledger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.verify_wallet_balances()
RETURNS TABLE(
  distributor_id uuid,
  cached_balance numeric,
  computed_balance numeric,
  drift numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.distributor_id,
    w.balance_zar AS cached_balance,
    COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount_zar ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN wt.type = 'debit' THEN wt.amount_zar ELSE 0 END), 0) AS computed_balance,
    w.balance_zar - (
      COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount_zar ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN wt.type = 'debit' THEN wt.amount_zar ELSE 0 END), 0)
    ) AS drift
  FROM public.wallets w
  LEFT JOIN public.wallet_transactions wt ON wt.distributor_id = w.distributor_id
  GROUP BY w.distributor_id, w.balance_zar
  HAVING w.balance_zar - (
    COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount_zar ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN wt.type = 'debit' THEN wt.amount_zar ELSE 0 END), 0)
  ) != 0;
END;
$$;
