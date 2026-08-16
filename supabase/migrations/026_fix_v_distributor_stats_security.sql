-- Migration 026: Fix v_distributor_stats SECURITY DEFINER advisory
-- The Supabase security advisor detected this view with SECURITY DEFINER.
-- Recreate it explicitly without that property.

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
