-- Migration 019: Refund Processing, Rank History Trigger, Audit Log Helper
-- Creates: process_refund() RPC for proportional commission reversal
-- Creates: fn_distributor_rank_change() trigger for auto rank_history
-- Creates: log_audit_event() helper function

-- =========================================================================
-- 1. PROCESS REFUND (proportional commission reversal)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.process_refund(
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
  v_commissionable numeric;
  v_refund_ratio numeric;
  v_total_reversed numeric := 0;
  v_commission RECORD;
  v_reversal_amount numeric;
  v_reversal_id uuid;
  v_inserted boolean;
  v_wallet RECORD;
  v_balance_after numeric;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- 1. Fetch order
  SELECT id, total_amount, commissionable_amount_zar, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- 2. Calculate refund ratio
  v_commissionable := COALESCE(v_order.commissionable_amount_zar, v_order.total_amount);
  IF v_commissionable <= 0 OR p_refund_amount_zar <= 0 THEN
    RAISE EXCEPTION 'Invalid commissionable or refund amount';
  END IF;

  v_refund_ratio := LEAST(p_refund_amount_zar / v_commissionable, 1.0);

  -- 3. Process each available commission for this order
  FOR v_commission IN
    SELECT * FROM public.commissions
    WHERE source_order_id = p_order_id
      AND status = 'available'
    ORDER BY level ASC
  LOOP
    -- Calculate proportional reversal amount
    v_reversal_amount := ROUND(v_commission.amount_zar * v_refund_ratio, 2);

    IF v_reversal_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Check if already reversed (idempotency)
    IF EXISTS (
      SELECT 1 FROM public.commissions
      WHERE reversal_of = v_commission.id AND status = 'reversed'
    ) THEN
      CONTINUE;
    END IF;

    -- Lock wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE distributor_id = v_commission.earner_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Check wallet balance
    IF v_wallet.balance_zar < v_reversal_amount THEN
      -- Create partner_debt instead of reversing
      INSERT INTO public.partner_debts (
        distributor_id, commission_id, original_amount_zar,
        outstanding_zar, status, reason
      ) VALUES (
        v_commission.earner_id, v_commission.id, v_reversal_amount,
        v_reversal_amount, 'outstanding', p_reason
      );

      -- Create the reversal commission record
      INSERT INTO public.commissions (
        earner_id, source_order_id, from_user_id, level, type,
        amount_zar, status, reversal_of, calc_version, note
      ) VALUES (
        v_commission.earner_id, p_order_id, v_order.user_id,
        v_commission.level, v_commission.type,
        v_reversal_amount, 'reversed', v_commission.id,
        v_commission.calc_version,
        'Refund reversal (insufficient balance): ' || p_reason
      ) RETURNING id INTO v_reversal_id;

      -- Log the debt creation
      v_results := v_results || jsonb_build_object(
        'commission_id', v_commission.id,
        'reversal_amount', v_reversal_amount,
        'debt_created', true,
        'earner_id', v_commission.earner_id
      );
    ELSE
      -- Sufficient balance — reverse normally
      v_balance_after := v_wallet.balance_zar - v_reversal_amount;

      -- Create wallet transaction (debit)
      INSERT INTO public.wallet_transactions (
        wallet_id, distributor_id, type, source_type, source_id,
        amount_zar, balance_after_zar, description, idempotency_key
      ) VALUES (
        v_commission.earner_id, v_commission.earner_id,
        'debit', 'reversal', v_commission.id,
        v_reversal_amount, v_balance_after,
        'Refund reversal: ' || p_reason,
        'refund_reversal:' || v_commission.id::text || ':' || p_order_id::text
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING true INTO v_inserted;

      IF v_inserted THEN
        UPDATE public.wallets
        SET balance_zar = v_balance_after,
            lifetime_reversed_zar = lifetime_reversed_zar + v_reversal_amount,
            updated_at = now()
        WHERE distributor_id = v_commission.earner_id;
      END IF;

      -- Create the reversal commission record
      INSERT INTO public.commissions (
        earner_id, source_order_id, from_user_id, level, type,
        amount_zar, status, reversal_of, calc_version, note
      ) VALUES (
        v_commission.earner_id, p_order_id, v_order.user_id,
        v_commission.level, v_commission.type,
        v_reversal_amount, 'reversed', v_commission.id,
        v_commission.calc_version,
        'Refund reversal: ' || p_reason
      ) RETURNING id INTO v_reversal_id;

      v_total_reversed := v_total_reversed + v_reversal_amount;

      v_results := v_results || jsonb_build_object(
        'commission_id', v_commission.id,
        'reversal_id', v_reversal_id,
        'reversal_amount', v_reversal_amount,
        'debt_created', false,
        'earner_id', v_commission.earner_id
      );
    END IF;
  END LOOP;

  -- 4. Audit log
  INSERT INTO public.audit_log (
    actor_id, actor_type, action, entity_type, entity_id,
    old_value, new_value, reason, metadata
  ) VALUES (
    p_actor_id, 'system', 'order.refund', 'order', p_order_id,
    jsonb_build_object('total_amount', v_order.total_amount),
    jsonb_build_object(
      'refund_amount', p_refund_amount_zar,
      'refund_ratio', v_refund_ratio,
      'total_reversed', v_total_reversed,
      'commissions_affected', jsonb_array_length(v_results)
    ),
    p_reason,
    jsonb_build_object('results', v_results)
  );

  RETURN jsonb_build_object(
    'refund_amount', p_refund_amount_zar,
    'refund_ratio', v_refund_ratio,
    'total_reversed', v_total_reversed,
    'commissions_affected', jsonb_array_length(v_results),
    'details', v_results
  );
END;
$$;

-- =========================================================================
-- 2. RANK HISTORY TRIGGER
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_distributor_rank_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.rank IS DISTINCT FROM NEW.rank THEN
    INSERT INTO public.rank_history (
      distributor_id, previous_rank, new_rank, reason
    ) VALUES (
      NEW.id, OLD.rank, NEW.rank,
      'Rank changed from ' || COALESCE(OLD.rank, 'none') || ' to ' || NEW.rank
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distributor_rank_change ON public.distributors;
CREATE TRIGGER trg_distributor_rank_change
  AFTER UPDATE OF rank ON public.distributors
  FOR EACH ROW
  WHEN (OLD.rank IS DISTINCT FROM NEW.rank)
  EXECUTE FUNCTION public.fn_distributor_rank_change();

-- =========================================================================
-- 3. AUDIT LOG HELPER FUNCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id uuid,
  p_actor_type text DEFAULT 'system',
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_old_value jsonb DEFAULT NULL,
  p_new_value jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_action IS NULL OR p_entity_type IS NULL THEN
    RAISE EXCEPTION 'action and entity_type are required';
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_type, action, entity_type, entity_id,
    old_value, new_value, reason, metadata
  ) VALUES (
    p_actor_id, p_actor_type, p_action, p_entity_type, p_entity_id,
    p_old_value, p_new_value, p_reason, p_metadata
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
