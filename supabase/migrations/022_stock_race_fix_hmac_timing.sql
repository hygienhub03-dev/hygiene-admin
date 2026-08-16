-- Migration 022: Fix race conditions and security issues
-- 1. Atomic stock decrement RPC (fixes lost-update race condition)
-- 2. Webhook idempotency via INSERT ON CONFLICT (fixes TOCTOU)
-- 3. Remove dead rule_id column from commissions

-- =========================================================================
-- 1. ATOMIC STOCK DECREMENT — prevents overselling under concurrent orders
-- =========================================================================
CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id uuid,
  p_quantity int,
  p_order_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'order'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_new_stock int;
BEGIN
  -- Lock the product row to prevent concurrent decrements
  SELECT id, stock, name INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found', p_product_id;
  END IF;

  IF v_product.stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for %: have %, need %',
      v_product.name, v_product.stock, p_quantity;
  END IF;

  v_new_stock := v_product.stock - p_quantity;

  UPDATE public.products
  SET stock = v_new_stock, updated_at = now()
  WHERE id = p_product_id;

  -- Record inventory movement
  INSERT INTO public.inventory_movements (
    product_id, order_id, quantity, previous_stock, new_stock, reason
  ) VALUES (
    p_product_id, p_order_id, -p_quantity, v_product.stock, v_new_stock, p_reason
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'previous_stock', v_product.stock,
    'new_stock', v_new_stock,
    'quantity_decremented', p_quantity
  );
END;
$$;

-- Batch version for multiple line items in a single transaction
CREATE OR REPLACE FUNCTION public.decrement_stock_batch(
  p_items jsonb,
  p_order_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'order'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_result := public.decrement_stock(
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::int,
      p_order_id,
      p_reason
    );
    v_results := v_results || v_result;
  END LOOP;

  RETURN jsonb_build_object('results', v_results);
END;
$$;

-- =========================================================================
-- 2. IDEMPOTENT WEBHOOK EVENT RECORDING — fixes TOCTOU race condition
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_webhook_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webhook_events (provider, event_id, event_type, payload, processed)
  VALUES (p_provider, p_event_id, p_event_type, p_payload, false)
  ON CONFLICT (provider, event_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

-- Mark webhook event as processed (idempotent)
CREATE OR REPLACE FUNCTION public.mark_webhook_processed(
  p_provider text,
  p_event_id text,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.webhook_events
  SET processed = true,
      processed_at = now(),
      error = p_error
  WHERE provider = p_provider
    AND event_id = p_event_id
    AND processed = false;
END;
$$;

-- =========================================================================
-- 3. REMOVE DEAD rule_id COLUMN FROM commissions
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'rule_id'
  ) THEN
    ALTER TABLE public.commissions DROP COLUMN rule_id;
  END IF;
END $$;
