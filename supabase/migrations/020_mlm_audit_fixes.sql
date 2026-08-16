-- Migration 020: Remaining Audit Fixes
-- 1. Fix orders RLS (add user_id ownership check)
-- 2. POPIA compliance (consent_records, data_export_requests, data_delete_requests)
-- 3. Cooling-off period enforcement
-- 4. Commission expiry function
-- 5. Auto commission approval after holding period
-- 6. VAT fields on orders

-- =========================================================================
-- 1. FIX ORDERS RLS — restrict UPDATE to own orders only
-- =========================================================================
DROP POLICY IF EXISTS orders_update_authenticated ON public.orders;
CREATE POLICY orders_update_own ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin bypass via service role (RLS doesn't apply to service role)

-- =========================================================================
-- 2. POPIA COMPLIANCE
-- =========================================================================

-- Consent records: track what consent each user has given
CREATE TABLE IF NOT EXISTS public.consent_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type  text NOT NULL CHECK (consent_type IN (
    'marketing_email', 'marketing_sms', 'data_processing',
    'third_party_sharing', 'profiling', 'cookies', 'terms'
  )),
  granted       boolean NOT NULL DEFAULT true,
  ip_address    inet,
  user_agent    text,
  consent_text  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON public.consent_records (user_id);
CREATE INDEX IF NOT EXISTS idx_consent_type ON public.consent_records (consent_type);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- Users can read own consents
CREATE POLICY consent_select_own ON public.consent_records
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert own consents (granting)
CREATE POLICY consent_insert_own ON public.consent_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Data export requests
CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  download_url  text,
  error         text
);

CREATE INDEX IF NOT EXISTS idx_data_export_user ON public.data_export_requests (user_id);

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_export_select_own ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY data_export_insert_own ON public.data_export_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Data deletion requests (right to erasure)
CREATE TABLE IF NOT EXISTS public.data_delete_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  reason        text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  processed_by  uuid,
  rejection_reason text
);

CREATE INDEX IF NOT EXISTS idx_data_delete_user ON public.data_delete_requests (user_id);

ALTER TABLE public.data_delete_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_delete_select_own ON public.data_delete_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY data_delete_insert_own ON public.data_delete_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Record initial consents for existing users
CREATE OR REPLACE FUNCTION public.record_initial_consents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.consent_records (user_id, consent_type, granted, consent_text)
  SELECT id, 'data_processing', true, 'Terms accepted at registration'
  FROM auth.users
  WHERE id NOT IN (
    SELECT user_id FROM public.consent_records
    WHERE consent_type = 'data_processing'
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- =========================================================================
-- 3. COOLING-OFF PERIOD ENFORCEMENT (5 business days SA CPA)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_within_cooling_off_period(
  p_order_created_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_business_days int := 0;
  v_check_date timestamptz := p_order_created_at;
  v_now timestamptz := now();
BEGIN
  -- Count business days (Mon-Fri) between order creation and now
  WHILE v_check_date < v_now LOOP
    IF EXTRACT(DOW FROM v_check_date) BETWEEN 1 AND 5 THEN
      v_business_days := v_business_days + 1;
    END IF;
    v_check_date := v_check_date + interval '1 day';
  END LOOP;

  RETURN v_business_days < 5;
END;
$$;

-- Enforce cooling-off in refund processing
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
BEGIN
  SELECT id, created_at INTO v_order
  FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_within_cooling_off := public.is_within_cooling_off_period(v_order.created_at);

  IF v_within_cooling_off THEN
    -- Full refund during cooling-off period — no commission reversal needed
    -- (commissions haven't been approved yet typically)
    INSERT INTO public.audit_log (
      actor_id, actor_type, action, entity_type, entity_id,
      new_value, reason
    ) VALUES (
      p_actor_id, 'system', 'order.cooling_off_refund', 'order', p_order_id,
      jsonb_build_object('refund_amount', p_refund_amount_zar, 'cooling_off', true),
      p_reason
    );

    RETURN jsonb_build_object(
      'refund_amount', p_refund_amount_zar,
      'cooling_off', true,
      'message', 'Full refund within cooling-off period'
    );
  ELSE
    -- After cooling-off: proportional commission reversal
    RETURN public.process_refund(p_order_id, p_refund_amount_zar, p_reason, p_actor_id);
  END IF;
END;
$$;

-- =========================================================================
-- 4. COMMISSION EXPIRY FUNCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.expire_commissions(
  p_holding_days int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holding_days int;
  v_expired_count int := 0;
  v_commission RECORD;
BEGIN
  -- Get holding period from settings if not provided
  IF p_holding_days IS NULL THEN
    SELECT COALESCE((value->>'holding_period_days')::int, 30)
    INTO v_holding_days
    FROM public.system_settings
    WHERE key = 'commission.holding_period_days';
  ELSE
    v_holding_days := p_holding_days;
  END IF;

  -- Expire commissions that are still pending after holding period + 90 days
  -- (pending commissions that were never approved get expired)
  FOR v_commission IN
    SELECT id, earner_id, amount_zar
    FROM public.commissions
    WHERE status = 'pending'
      AND created_at < now() - ((v_holding_days + 90) || ' days')::interval
  LOOP
    UPDATE public.commissions
    SET status = 'reversed', note = COALESCE(note || ' | ', '') || 'Expired after ' || (v_holding_days + 90) || ' days'
    WHERE id = v_commission.id AND status = 'pending';

    v_expired_count := v_expired_count + 1;

    -- Audit log
    INSERT INTO public.audit_log (
      actor_type, action, entity_type, entity_id, new_value, reason
    ) VALUES (
      'system', 'commission.expire', 'commission', v_commission.id,
      jsonb_build_object('status', 'reversed', 'amount_zar', v_commission.amount_zar),
      'Commission expired: not approved within ' || (v_holding_days + 90) || ' days'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'expired_count', v_expired_count,
    'holding_days', v_holding_days
  );
END;
$$;

-- =========================================================================
-- 5. AUTO COMMISSION APPROVAL AFTER HOLDING PERIOD
-- =========================================================================
CREATE OR REPLACE FUNCTION public.auto_approve_commissions(
  p_batch_size int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holding_days int;
  v_approved_count int := 0;
  v_commission RECORD;
BEGIN
  -- Get holding period
  SELECT COALESCE((value->>'holding_period_days')::int, 30)
  INTO v_holding_days
  FROM public.system_settings
  WHERE key = 'commission.holding_period_days';

  -- Auto-approve pending commissions past holding period
  FOR v_commission IN
    SELECT id
    FROM public.commissions
    WHERE status = 'pending'
      AND created_at <= now() - (v_holding_days || ' days')::interval
    LIMIT p_batch_size
  LOOP
    BEGIN
      PERFORM public.approve_commission(v_commission.id, NULL);
      v_approved_count := v_approved_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Skip if approval fails (e.g., wallet issues)
      RAISE NOTICE 'Failed to auto-approve commission %: %', v_commission.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'approved_count', v_approved_count,
    'holding_days', v_holding_days
  );
END;
$$;

-- =========================================================================
-- 6. VAT FIELDS ON ORDERS
-- =========================================================================
-- Check if columns exist before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'vat_amount_zar'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN vat_amount_zar numeric(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN vat_rate numeric(5,4) NOT NULL DEFAULT 0.15;
    ALTER TABLE public.orders ADD COLUMN subtotal_excl_vat numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
