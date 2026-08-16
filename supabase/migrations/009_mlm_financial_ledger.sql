-- Migration 7: Financial Ledger + RPC Functions
-- Creates: wallet_transactions table
-- Creates: approve_commission, reverse_commission, settle_debt_on_credit functions
-- The wallet_transactions table is the authoritative financial record
-- Wallet balances are cached values derived from this ledger

-- =========================================================================
-- 1. WALLET TRANSACTIONS (immutable financial ledger)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id         uuid NOT NULL REFERENCES public.wallets(distributor_id) ON DELETE CASCADE,
  distributor_id    uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('credit', 'debit')),
  source_type       text NOT NULL CHECK (source_type IN (
                      'commission', 'payout', 'reversal', 'debt_settlement', 'adjustment', 'correction'
                    )),
  source_id         uuid,
  amount_zar        numeric(12,2) NOT NULL CHECK (amount_zar > 0),
  balance_after_zar numeric(12,2) NOT NULL,
  description       text,
  idempotency_key   text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wt_distributor
  ON public.wallet_transactions (distributor_id);
CREATE INDEX IF NOT EXISTS idx_wt_wallet
  ON public.wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wt_source
  ON public.wallet_transactions (source_type, source_id);

-- =========================================================================
-- 2. RLS (append-only, read own)
-- =========================================================================
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Partners can read own transactions
DROP POLICY IF EXISTS wt_select_own ON public.wallet_transactions;
CREATE POLICY wt_select_own ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated users
-- Only created via SECURITY DEFINER functions

-- =========================================================================
-- 3. SETTLE DEBT ON CREDIT (helper function)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.settle_debt_on_credit(
  p_distributor_id uuid,
  p_amount_zar numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_amount_zar;
  v_debt RECORD;
BEGIN
  FOR v_debt IN
    SELECT id, outstanding_zar FROM public.partner_debts
    WHERE distributor_id = p_distributor_id
      AND status IN ('outstanding', 'partially_settled')
    ORDER BY created_at ASC
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;

    IF v_debt.outstanding_zar <= v_remaining THEN
      -- Settle this debt fully
      UPDATE public.partner_debts
      SET outstanding_zar = 0, status = 'settled', settled_at = now()
      WHERE id = v_debt.id;

      INSERT INTO public.wallet_transactions (
        wallet_id, distributor_id, type, source_type, source_id,
        amount_zar, balance_after_zar, description, idempotency_key
      ) VALUES (
        p_distributor_id, p_distributor_id, 'debit', 'debt_settlement',
        v_debt.id, v_debt.outstanding_zar, 0,
        'Debt settlement', 'debt_settle:' || v_debt.id::text
      ) ON CONFLICT (idempotency_key) DO NOTHING;

      v_remaining := v_remaining - v_debt.outstanding_zar;
    ELSE
      -- Partially settle this debt
      UPDATE public.partner_debts
      SET outstanding_zar = outstanding_zar - v_remaining,
          status = 'partially_settled'
      WHERE id = v_debt.id;

      INSERT INTO public.wallet_transactions (
        wallet_id, distributor_id, type, source_type, source_id,
        amount_zar, balance_after_zar, description, idempotency_key
      ) VALUES (
        p_distributor_id, p_distributor_id, 'debit', 'debt_settlement',
        v_debt.id, v_remaining, 0,
        'Partial debt settlement', 'debt_settle:' || v_debt.id::text || ':partial'
      ) ON CONFLICT (idempotency_key) DO NOTHING;

      v_remaining := 0;
    END IF;
  END LOOP;

  RETURN v_remaining; -- unapplied amount (becomes wallet credit)
END;
$$;

-- =========================================================================
-- 4. APPROVE COMMISSION (atomic)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.approve_commission(
  p_commission_id uuid,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission RECORD;
  v_inserted boolean;
  v_balance_after numeric;
  v_holding_days int;
BEGIN
  -- 1. Lock commission, validate state
  SELECT * INTO v_commission
  FROM public.commissions
  WHERE id = p_commission_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission % not found or not pending', p_commission_id;
  END IF;

  -- 2. Check holding period
  SELECT COALESCE((value->>'holding_period_days')::int, 30)
  INTO v_holding_days
  FROM public.system_settings WHERE key = 'commission.holding_period_days';

  IF v_commission.created_at > now() - (v_holding_days || ' days')::interval THEN
    RAISE EXCEPTION 'Commission % still in holding period', p_commission_id;
  END IF;

  -- 3. Settle any outstanding debt first
  v_balance_after := public.settle_debt_on_credit(v_commission.earner_id, v_commission.amount_zar);

  -- 4. Create wallet transaction (credit) — only if not already created
  INSERT INTO public.wallet_transactions (
    wallet_id, distributor_id, type, source_type, source_id,
    amount_zar, balance_after_zar, description, idempotency_key
  ) VALUES (
    v_commission.earner_id, v_commission.earner_id,
    'credit', 'commission', v_commission.id,
    v_commission.amount_zar, v_balance_after,
    'Commission L' || v_commission.level || ' approved',
    'commission:' || v_commission.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING true INTO v_inserted;

  -- 5. If transaction was newly inserted, update wallet balance
  IF v_inserted THEN
    UPDATE public.wallets
    SET balance_zar = v_balance_after,
        lifetime_earned_zar = lifetime_earned_zar + v_commission.amount_zar,
        updated_at = now()
    WHERE distributor_id = v_commission.earner_id;
  END IF;

  -- 6. Update commission status
  UPDATE public.commissions
  SET status = 'available', approved_at = now(), approved_by = p_admin_id
  WHERE id = p_commission_id AND status = 'pending';

  -- 7. Audit log
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, new_value)
  VALUES (p_admin_id, 'admin', 'commission.approve', 'commission', p_commission_id,
    jsonb_build_object('status', 'available', 'amount_zar', v_commission.amount_zar));
END;
$$;

-- =========================================================================
-- 5. REVERSE COMMISSION (atomic)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reverse_commission(
  p_commission_id uuid,
  p_reason text,
  p_actor_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission RECORD;
  v_wallet RECORD;
  v_inserted boolean;
  v_balance_after numeric;
BEGIN
  -- 1. Lock commission, must be available
  SELECT * INTO v_commission
  FROM public.commissions
  WHERE id = p_commission_id AND status = 'available'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission % not found or not in available status', p_commission_id;
  END IF;

  -- 2. Lock wallet
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE distributor_id = v_commission.earner_id
  FOR UPDATE;

  -- 3. Check wallet has sufficient balance
  IF v_wallet.balance_zar < v_commission.amount_zar THEN
    RAISE EXCEPTION 'Insufficient wallet balance for reversal (balance: %, reversal: %)',
      v_wallet.balance_zar, v_commission.amount_zar;
  END IF;

  v_balance_after := v_wallet.balance_zar - v_commission.amount_zar;

  -- 4. Create wallet transaction (debit)
  INSERT INTO public.wallet_transactions (
    wallet_id, distributor_id, type, source_type, source_id,
    amount_zar, balance_after_zar, description, idempotency_key
  ) VALUES (
    v_commission.earner_id, v_commission.earner_id,
    'debit', 'reversal', v_commission.id,
    v_commission.amount_zar, v_balance_after,
    'Commission reversal: ' || p_reason,
    'reversal:' || v_commission.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING true INTO v_inserted;

  -- 5. Update wallet balance
  IF v_inserted THEN
    UPDATE public.wallets
    SET balance_zar = v_balance_after,
        lifetime_reversed_zar = lifetime_reversed_zar + v_commission.amount_zar,
        updated_at = now()
    WHERE distributor_id = v_commission.earner_id;
  END IF;

  -- 6. Update commission status
  UPDATE public.commissions
  SET status = 'reversed'
  WHERE id = p_commission_id AND status = 'available';

  -- 7. Audit log
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, reason)
  VALUES (
    p_actor_id,
    COALESCE(
      (SELECT actor_type FROM public.audit_log WHERE actor_id = p_actor_id LIMIT 1),
      'system'
    ),
    'commission.reverse', 'commission', p_commission_id,
    jsonb_build_object('status', 'available', 'amount_zar', v_commission.amount_zar),
    jsonb_build_object('status', 'reversed'),
    p_reason
  );
END;
$$;
