-- Migration 9: Payouts + RPC Functions
-- Creates: payouts table with partial unique indexes
-- Creates: request_payout, process_payout functions
-- Payout states: requested → approved → processing → paid/failed/cancelled

-- =========================================================================
-- 1. PAYOUTS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  amount_zar      numeric(12,2) NOT NULL CHECK (amount_zar > 0),
  method          text NOT NULL DEFAULT 'eft'
                    CHECK (method IN ('eft', 'paystack_transfer', 'other')),
  status          text NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested', 'approved', 'processing', 'paid', 'failed', 'cancelled')),
  reference       text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  paid_at         timestamptz
);

-- Only ONE pending payout request per distributor at a time
CREATE UNIQUE INDEX idx_payouts_one_pending
  ON public.payouts (distributor_id)
  WHERE status = 'requested';

-- Only ONE processing payout per distributor at a time
CREATE UNIQUE INDEX idx_payouts_one_processing
  ON public.payouts (distributor_id)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_payouts_distributor
  ON public.payouts (distributor_id);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Partners can read own payouts
DROP POLICY IF EXISTS payouts_select_own ON public.payouts;
CREATE POLICY payouts_select_own ON public.payouts
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- Partners can insert payout requests (status = requested only)
DROP POLICY IF EXISTS payouts_insert_own_requested ON public.payouts;
CREATE POLICY payouts_insert_own_requested ON public.payouts
  FOR INSERT TO authenticated
  WITH CHECK (distributor_id = auth.uid() AND status = 'requested');

-- =========================================================================
-- 3. REQUEST PAYOUT (partner RPC)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.request_payout(
  p_distributor_id uuid,
  p_amount_zar numeric,
  p_method text DEFAULT 'eft'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet RECORD;
  v_min_payout numeric;
  v_payout_id uuid;
BEGIN
  -- Verify distributor is the authenticated user
  IF p_distributor_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify distributor is active
  IF NOT EXISTS (
    SELECT 1 FROM public.distributors
    WHERE id = p_distributor_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Distributor not active';
  END IF;

  -- Read minimum payout from settings
  SELECT COALESCE((value->>'min_amount_zar')::numeric, 100)
  INTO v_min_payout
  FROM public.system_settings WHERE key = 'payout.min_amount_zar';

  IF p_amount_zar < v_min_payout THEN
    RAISE EXCEPTION 'Minimum payout is R%', v_min_payout;
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE distributor_id = p_distributor_id
  FOR UPDATE;

  -- Check available balance (balance - reserved)
  IF (v_wallet.balance_zar - v_wallet.reserved_zar) < p_amount_zar THEN
    RAISE EXCEPTION 'Insufficient available balance (available: R%, requested: R%)',
      v_wallet.balance_zar - v_wallet.reserved_zar, p_amount_zar;
  END IF;

  -- Check no existing requested/processing payout
  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE distributor_id = p_distributor_id
      AND status IN ('requested', 'approved', 'processing')
  ) THEN
    RAISE EXCEPTION 'Existing payout request in progress';
  END IF;

  -- Reserve funds
  UPDATE public.wallets
  SET reserved_zar = reserved_zar + p_amount_zar, updated_at = now()
  WHERE distributor_id = p_distributor_id;

  -- Create payout
  INSERT INTO public.payouts (distributor_id, amount_zar, method, status)
  VALUES (p_distributor_id, p_amount_zar, p_method, 'requested')
  RETURNING id INTO v_payout_id;

  -- Audit
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, new_value)
  VALUES (p_distributor_id, 'partner', 'payout.request', 'payout', v_payout_id,
    jsonb_build_object('amount_zar', p_amount_zar, 'method', p_method));

  RETURN v_payout_id;
END;
$$;

-- =========================================================================
-- 4. PROCESS PAYOUT (admin RPC)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.process_payout(
  p_payout_id uuid,
  p_action text,
  p_admin_id uuid,
  p_note text DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_wallet RECORD;
  v_idempotency_key text;
BEGIN
  SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;

  CASE p_action
    WHEN 'approve' THEN
      IF v_payout.status != 'requested' THEN
        RAISE EXCEPTION 'Can only approve requested payouts';
      END IF;
      UPDATE public.payouts
      SET status = 'approved', processed_at = now(), note = p_note
      WHERE id = p_payout_id;

    WHEN 'process' THEN
      IF v_payout.status != 'approved' THEN
        RAISE EXCEPTION 'Can only process approved payouts';
      END IF;
      UPDATE public.payouts
      SET status = 'processing', note = p_note
      WHERE id = p_payout_id;

    WHEN 'pay' THEN
      -- Payment confirmed — NOW debit wallet
      IF v_payout.status != 'processing' THEN
        RAISE EXCEPTION 'Can only pay processing payouts';
      END IF;

      SELECT * INTO v_wallet
      FROM public.wallets
      WHERE distributor_id = v_payout.distributor_id
      FOR UPDATE;

      IF v_wallet.balance_zar < v_payout.amount_zar THEN
        RAISE EXCEPTION 'Insufficient wallet balance for payout';
      END IF;

      v_idempotency_key := 'payout:' || v_payout.id::text;
      INSERT INTO public.wallet_transactions (
        wallet_id, distributor_id, type, source_type, source_id,
        amount_zar, balance_after_zar, description, idempotency_key
      ) VALUES (
        v_payout.distributor_id, v_payout.distributor_id,
        'debit', 'payout', v_payout.id,
        v_payout.amount_zar, v_wallet.balance_zar - v_payout.amount_zar,
        'Payout withdrawal', v_idempotency_key
      ) ON CONFLICT (idempotency_key) DO NOTHING;

      UPDATE public.wallets
      SET balance_zar = balance_zar - v_payout.amount_zar,
          reserved_zar = reserved_zar - v_payout.amount_zar,
          lifetime_paid_zar = lifetime_paid_zar + v_payout.amount_zar,
          updated_at = now()
      WHERE distributor_id = v_payout.distributor_id;

      UPDATE public.payouts
      SET status = 'paid', paid_at = now(), reference = p_reference, note = p_note
      WHERE id = p_payout_id;

    WHEN 'reject' THEN
      IF v_payout.status NOT IN ('requested', 'approved') THEN
        RAISE EXCEPTION 'Cannot reject payout in status %', v_payout.status;
      END IF;
      -- Release reservation
      UPDATE public.wallets
      SET reserved_zar = reserved_zar - v_payout.amount_zar, updated_at = now()
      WHERE distributor_id = v_payout.distributor_id;
      UPDATE public.payouts
      SET status = 'rejected', processed_at = now(), note = p_note
      WHERE id = p_payout_id;

    WHEN 'cancel' THEN
      IF v_payout.status NOT IN ('requested', 'approved') THEN
        RAISE EXCEPTION 'Cannot cancel payout in status %', v_payout.status;
      END IF;
      -- Release reservation
      UPDATE public.wallets
      SET reserved_zar = reserved_zar - v_payout.amount_zar, updated_at = now()
      WHERE distributor_id = v_payout.distributor_id;
      UPDATE public.payouts
      SET status = 'cancelled', processed_at = now(), note = p_note
      WHERE id = p_payout_id;

    WHEN 'fail' THEN
      IF v_payout.status != 'processing' THEN
        RAISE EXCEPTION 'Can only fail processing payouts';
      END IF;
      -- Release reservation (payment failed, money returns to available)
      UPDATE public.wallets
      SET reserved_zar = reserved_zar - v_payout.amount_zar, updated_at = now()
      WHERE distributor_id = v_payout.distributor_id;
      UPDATE public.payouts
      SET status = 'failed', processed_at = now(), note = p_note
      WHERE id = p_payout_id;

    ELSE
      RAISE EXCEPTION 'Invalid action: %', p_action;
  END CASE;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, new_value, reason)
  VALUES (p_admin_id, 'admin', 'payout.' || p_action, 'payout', p_payout_id,
    jsonb_build_object('status', p_action, 'amount_zar', v_payout.amount_zar), p_note);
END;
$$;
