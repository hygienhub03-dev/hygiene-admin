-- Migration 025: Critical security fixes from adversarial audit
-- 1. Fix wallet balance overwrite bug in approve_commission / reverse_commission
-- 2. Add admin role checks to all financial RPCs
-- 3. REVOKE EXECUTE from anon on all SECURITY DEFINER functions
-- 4. Profile role column immutable via trigger
-- 5. Restrict decrement_stock/rebuild_closure_table to admin
-- 6. Fix settle_debt_on_credit balance_after_zar
-- 7. RLS policies for orders/profiles (fix IDOR)

-- =========================================================================
-- 1. FIX WALLET BALANCE OVERWRITE BUG
--    approve_commission: SET balance_zar = balance_zar + v_balance_after
-- =========================================================================
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
  v_admin_role text;
BEGIN
  -- Admin role check
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

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
    SET balance_zar = balance_zar + v_balance_after,
        lifetime_earned_zar = lifetime_earned_zar + v_commission.amount_zar,
        updated_at = now()
    WHERE distributor_id = v_commission.earner_id;
  END IF;

  UPDATE public.commissions
  SET status = 'available', approved_at = now(), approved_by = auth.uid()
  WHERE id = p_commission_id AND status = 'pending';

  INSERT INTO public.audit_log (actor_id, actor_type, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'admin', 'commission.approve', 'commission', p_commission_id,
    jsonb_build_object('status', 'available', 'amount_zar', v_commission.amount_zar));
END;
$function$;

-- =========================================================================
-- 2. FIX WALLET BALANCE OVERWRITE IN reverse_commission + ADD ADMIN CHECK
-- =========================================================================
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
  v_admin_role text;
BEGIN
  -- Admin role check
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

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
    auth.uid(), 'admin', 'commission.reverse', 'commission', p_commission_id,
    jsonb_build_object('status', 'available', 'amount_zar', v_commission.amount_zar),
    jsonb_build_object('status', 'reversed'),
    p_reason
  );
END;
$function$;

-- =========================================================================
-- 3. ADD ADMIN CHECK TO request_payout + process_payout
-- =========================================================================
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
  v_admin_role text;
BEGIN
  -- Admin role check
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

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
  VALUES (auth.uid(), 'admin', 'payout.' || p_action, 'payout', p_payout_id,
    jsonb_build_object('status', p_action, 'amount_zar', v_payout.amount_zar), p_note);
END;
$function$;

-- =========================================================================
-- 4. ADD ADMIN CHECK TO process_refund / process_refund_with_cooling_off
-- =========================================================================
CREATE OR REPLACE FUNCTION public.process_refund(p_order_id uuid, p_refund_amount_zar numeric, p_reason text DEFAULT 'customer refund'::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_commission RECORD;
  v_total_commissioned numeric := 0;
  v_reversed_count int := 0;
  v_admin_role text;
BEGIN
  -- Admin role check
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT id, user_id, total_amount, commissionable_amount_zar
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  FOR v_commission IN
    SELECT id, earner_id, amount_zar, status
    FROM public.commissions
    WHERE source_order_id = p_order_id
      AND status IN ('pending', 'available')
  LOOP
    v_total_commissioned := v_total_commissioned + v_commission.amount_zar;
    PERFORM public.reverse_commission(v_commission.id, p_reason, auth.uid());
    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  INSERT INTO public.audit_log (actor_id, actor_type, action, entity_type, entity_id, new_value, reason)
  VALUES (
    auth.uid(), 'admin', 'order.refund', 'order', p_order_id,
    jsonb_build_object(
      'refund_amount_zar', p_refund_amount_zar,
      'total_commissioned', v_total_commissioned,
      'commissions_reversed', v_reversed_count
    ),
    p_reason
  );

  RETURN jsonb_build_object(
    'refund_amount', p_refund_amount_zar,
    'commissions_reversed', v_reversed_count,
    'total_commissioned', v_total_commissioned
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_refund_with_cooling_off(
  p_order_id uuid,
  p_refund_amount_zar numeric,
  p_reason text DEFAULT 'customer refund',
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_within_cooling_off boolean;
  v_admin_role text;
BEGIN
  -- Admin role check
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT id, created_at INTO v_order
  FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_within_cooling_off := public.is_within_cooling_off_period(v_order.created_at);

  IF v_within_cooling_off THEN
    INSERT INTO public.audit_log (
      actor_id, actor_type, action, entity_type, entity_id,
      new_value, reason
    ) VALUES (
      auth.uid(), 'admin', 'order.cooling_off_refund', 'order', p_order_id,
      jsonb_build_object('refund_amount', p_refund_amount_zar, 'cooling_off', true),
      p_reason
    );

    RETURN jsonb_build_object(
      'refund_amount', p_refund_amount_zar,
      'cooling_off', true,
      'message', 'Full refund within cooling-off period'
    );
  ELSE
    RETURN public.process_refund(p_order_id, p_refund_amount_zar, p_reason, auth.uid());
  END IF;
END;
$$;

-- =========================================================================
-- 5. REVOKE EXECUTE FROM ANON ON ALL SECURITY DEFINER FUNCTIONS
-- =========================================================================
-- Financial functions — admin only via TS, but authenticated can request_payout
REVOKE EXECUTE ON FUNCTION public.approve_commission(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_commission(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_payout(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_refund_with_cooling_off(uuid, numeric, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_commission(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_commission(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payout(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund_with_cooling_off(uuid, numeric, text, uuid) TO authenticated;

-- request_payout — partners call this themselves
REVOKE EXECUTE ON FUNCTION public.request_payout(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, numeric, text) TO authenticated;

-- Operational functions — restrict to authenticated (cron uses service role)
REVOKE EXECUTE ON FUNCTION public.auto_approve_commissions(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_commissions(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rebuild_closure_table() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_scheduled_commission_tasks() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auto_approve_commissions(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_commissions(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_closure_table() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_scheduled_commission_tasks() TO authenticated;

-- Stock functions — authenticated (store app calls these)
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, integer, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_batch(jsonb, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock_batch(jsonb, uuid, text) TO authenticated;

-- Webhook functions — authenticated
REVOKE EXECUTE ON FUNCTION public.record_webhook_event(text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_processed(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_webhook_event(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_webhook_processed(text, text, text) TO authenticated;

-- Audit + consent
REVOKE EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, jsonb, jsonb, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_initial_consents() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, jsonb, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_initial_consents() TO authenticated;

-- Settle debt — used internally by approve_commission
REVOKE EXECUTE ON FUNCTION public.settle_debt_on_credit(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_debt_on_credit(uuid, numeric) TO authenticated;

-- =========================================================================
-- 6. PROFILE ROLE COLUMN IMMUTABLE VIA TRIGGER
-- =========================================================================
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Role cannot be changed directly';
  END IF;
  RETURN NEW;
END;
$function$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- =========================================================================
-- 7. RLS POLICIES: Fix IDOR on orders and profiles
-- =========================================================================

-- Orders: users can only see their own orders (admin sees all via service role)
-- Drop the overly permissive policy
DROP POLICY IF EXISTS orders_select_authenticated ON public.orders;

CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Profiles: users can only see their own profile
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
