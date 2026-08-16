-- Migration 023: Fix critical bugs from production audit
-- 1. Create missing inventory_movements table
-- 2. Create missing email_events table
-- 3. Fix actor_role → actor_type in 4 SQL functions
-- 4. (TypeScript fixes applied separately in commissions.ts)

-- =========================================================================
-- 1. CREATE inventory_movements TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id        uuid,
  quantity        int NOT NULL,
  previous_stock  int NOT NULL,
  new_stock       int NOT NULL,
  reason          text NOT NULL DEFAULT 'order',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product
  ON public.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order
  ON public.inventory_movements (order_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Service role only (no partner access)
-- No policies = no access for authenticated users

-- =========================================================================
-- 2. CREATE email_events TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.email_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL,
  recipient       text NOT NULL,
  subject         text,
  status          text NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent', 'failed', 'delivered', 'bounced')),
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_recipient
  ON public.email_events (recipient, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type
  ON public.email_events (type, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Service role only (no partner access)
-- No policies = no access for authenticated users

-- =========================================================================
-- 3. FIX actor_role → actor_type IN SQL FUNCTIONS
-- =========================================================================

-- Fix approve_commission: actor_role → actor_type
CREATE OR REPLACE FUNCTION public.approve_commission(p_commission_id uuid, p_admin_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_commission RECORD;
  v_inserted boolean;
  v_balance_after numeric;
  v_holding_days int;
BEGIN
  SELECT * INTO v_commission
  FROM public.commissions
  WHERE id = p_commission_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission % not found or not pending', p_commission_id;
  END IF;

  SELECT COALESCE((value->>'holding_period_days')::int, 30)
  INTO v_holding_days
  FROM public.system_settings WHERE key = 'commission.holding_period_days';

  IF v_commission.created_at > now() - (v_holding_days || ' days')::interval THEN
    RAISE EXCEPTION 'Commission % still in holding period', p_commission_id;
  END IF;

  v_balance_after := public.settle_debt_on_credit(v_commission.earner_id, v_commission.amount_zar);

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

  IF v_inserted THEN
    UPDATE public.wallets
    SET balance_zar = v_balance_after,
        lifetime_earned_zar = lifetime_earned_zar + v_commission.amount_zar,
        updated_at = now()
    WHERE distributor_id = v_commission.earner_id;
  END IF;

  UPDATE public.commissions
  SET status = 'available', approved_at = now(), approved_by = p_admin_id
  WHERE id = p_commission_id AND status = 'pending';

  INSERT INTO public.audit_log (actor_id, actor_type, action, entity_type, entity_id, new_value)
  VALUES (p_admin_id, 'admin', 'commission.approve', 'commission', p_commission_id,
    jsonb_build_object('status', 'available', 'amount_zar', v_commission.amount_zar));
END;
$function$;

-- Fix reverse_commission: actor_role → actor_type
CREATE OR REPLACE FUNCTION public.reverse_commission(p_commission_id uuid, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_commission RECORD;
  v_wallet RECORD;
  v_inserted boolean;
  v_balance_after numeric;
BEGIN
  SELECT * INTO v_commission
  FROM public.commissions
  WHERE id = p_commission_id AND status = 'available'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission % not found or not in available status', p_commission_id;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE distributor_id = v_commission.earner_id
  FOR UPDATE;

  IF v_wallet.balance_zar < v_commission.amount_zar THEN
    RAISE EXCEPTION 'Insufficient wallet balance for reversal';
  END IF;

  v_balance_after := v_wallet.balance_zar - v_commission.amount_zar;

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

  IF v_inserted THEN
    UPDATE public.wallets
    SET balance_zar = v_balance_after,
        lifetime_reversed_zar = lifetime_reversed_zar + v_commission.amount_zar,
        updated_at = now()
    WHERE distributor_id = v_commission.earner_id;
  END IF;

  UPDATE public.commissions
  SET status = 'reversed'
  WHERE id = p_commission_id AND status = 'available';

  INSERT INTO public.audit_log (actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, reason)
  VALUES (
    p_actor_id, 'system', 'commission.reverse', 'commission', p_commission_id,
    jsonb_build_object('status', 'available', 'amount_zar', v_commission.amount_zar),
    jsonb_build_object('status', 'reversed'),
    p_reason
  );
END;
$function$;

-- Fix request_payout: actor_role → actor_type
CREATE OR REPLACE FUNCTION public.request_payout(p_distributor_id uuid, p_amount_zar numeric, p_method text DEFAULT 'eft'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet RECORD;
  v_min_payout numeric;
  v_payout_id uuid;
BEGIN
  IF p_distributor_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.distributors
    WHERE id = p_distributor_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Distributor not active';
  END IF;

  SELECT COALESCE((value->>'min_amount_zar')::numeric, 100)
  INTO v_min_payout
  FROM public.system_settings WHERE key = 'payout.min_amount_zar';

  IF p_amount_zar < v_min_payout THEN
    RAISE EXCEPTION 'Minimum payout is R%', v_min_payout;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE distributor_id = p_distributor_id
  FOR UPDATE;

  IF (v_wallet.balance_zar - v_wallet.reserved_zar) < p_amount_zar THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE distributor_id = p_distributor_id
      AND status IN ('requested', 'approved', 'processing')
  ) THEN
    RAISE EXCEPTION 'Existing payout request in progress';
  END IF;

  UPDATE public.wallets
  SET reserved_zar = reserved_zar + p_amount_zar, updated_at = now()
  WHERE distributor_id = p_distributor_id;

  INSERT INTO public.payouts (distributor_id, amount_zar, method, status)
  VALUES (p_distributor_id, p_amount_zar, p_method, 'requested')
  RETURNING id INTO v_payout_id;

  INSERT INTO public.audit_log (actor_id, actor_type, action, entity_type, entity_id, new_value)
  VALUES (p_distributor_id, 'partner', 'payout.request', 'payout', v_payout_id,
    jsonb_build_object('amount_zar', p_amount_zar, 'method', p_method));

  RETURN v_payout_id;
END;
$function$;

-- Fix process_payout: actor_role → actor_type
CREATE OR REPLACE FUNCTION public.process_payout(p_payout_id uuid, p_action text, p_admin_id uuid, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      UPDATE public.wallets
      SET reserved_zar = reserved_zar - v_payout.amount_zar, updated_at = now()
      WHERE distributor_id = v_payout.distributor_id;
      UPDATE public.payouts
      SET status = 'failed', processed_at = now(), note = p_note
      WHERE id = p_payout_id;

    ELSE
      RAISE EXCEPTION 'Invalid action: %', p_action;
  END CASE;

  INSERT INTO public.audit_log (actor_id, actor_type, action, entity_type, entity_id, new_value, reason)
  VALUES (p_admin_id, 'admin', 'payout.' || p_action, 'payout', p_payout_id,
    jsonb_build_object('status', p_action, 'amount_zar', v_payout.amount_zar), p_note);
END;
$function$;
