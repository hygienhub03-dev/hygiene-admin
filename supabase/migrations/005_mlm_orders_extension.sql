-- Migration 3: Orders Extension
-- Adds: sponsor_id, referral_code, commissionable_amount_zar to orders
-- These columns enable referral attribution and commission calculation

-- =========================================================================
-- 1. ADD COLUMNS TO ORDERS (conditional — only if orders table exists)
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    -- sponsor_id: which distributor referred this order
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'sponsor_id'
    ) THEN
      ALTER TABLE public.orders
        ADD COLUMN sponsor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL;
    END IF;

    -- referral_code: the referral code used at checkout
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'referral_code'
    ) THEN
      ALTER TABLE public.orders
        ADD COLUMN referral_code text;
    END IF;

    -- commissionable_amount_zar: the amount commissions are calculated from
    -- This is computed at order creation and immutable
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'commissionable_amount_zar'
    ) THEN
      ALTER TABLE public.orders
        ADD COLUMN commissionable_amount_zar numeric(12,2) NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;

-- =========================================================================
-- 2. INDEXES
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'sponsor_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_orders_sponsor ON public.orders (sponsor_id);
  END IF;
END $$;
