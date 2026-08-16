-- Migration 5: System Settings + Commission Rules
-- Creates: system_settings, product_commission_rules
-- Creates: resolve_commission_rate function
-- Seeds: default system settings

-- =========================================================================
-- 1. SYSTEM SETTINGS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('commission.max_depth', '5'::jsonb, 'Maximum upline levels that earn commission'),
  ('commission.default_rates', '[0.10, 0.05, 0.03, 0.02, 0.01]'::jsonb, 'Default commission rates by level (10%, 5%, 3%, 2%, 1%)'),
  ('commission.holding_period_days', '30'::jsonb, 'Days before pending commissions can be approved'),
  ('commission.volume_includes_shipping', 'false'::jsonb, 'Whether commissionable amount includes shipping cost'),
  ('commission.min_amount_zar', '0.01'::jsonb, 'Minimum commission amount to create a record'),
  ('payout.min_amount_zar', '100.00'::jsonb, 'Minimum payout request amount'),
  ('payout.max_pending_requests', '1'::jsonb, 'Maximum simultaneous pending payout requests per distributor'),
  ('referral.cookie_max_age_days', '30'::jsonb, 'Referral cookie lifetime in days'),
  ('referral.attribution_model', '"last-touch"'::jsonb, 'Referral attribution model (last-touch or first-touch)'),
  ('currency', '"ZAR"'::jsonb, 'System currency')
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- 2. PRODUCT COMMISSION RULES
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.product_commission_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category_id       uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  level             int NOT NULL CHECK (level >= 1),
  rank_name         text,
  rate              numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  type              text NOT NULL DEFAULT 'percentage'
                      CHECK (type IN ('percentage', 'fixed')),
  fixed_amount_zar  numeric(12,2),
  effective_from    timestamptz NOT NULL DEFAULT now(),
  effective_to      timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id),

  -- Must specify product OR category OR neither (global), not both
  CONSTRAINT rule_target_check CHECK (
    (product_id IS NOT NULL AND category_id IS NULL)
    OR (product_id IS NULL AND category_id IS NOT NULL)
    OR (product_id IS NULL AND category_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_product
  ON public.product_commission_rules (product_id, level, is_active);
CREATE INDEX IF NOT EXISTS idx_commission_rules_category
  ON public.product_commission_rules (category_id, level, is_active);
CREATE INDEX IF NOT EXISTS idx_commission_rules_global
  ON public.product_commission_rules (level, is_active)
  WHERE product_id IS NULL AND category_id IS NULL;

-- =========================================================================
-- 3. RESOLVE COMMISSION RATE FUNCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.resolve_commission_rate(
  p_product_id uuid,
  p_category_id uuid,
  p_level int,
  p_rank_name text
) RETURNS TABLE(rate numeric, rule_id uuid, rule_type text, fixed_amount numeric)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT r.rate, r.id, r.type, r.fixed_amount_zar
  FROM public.product_commission_rules r
  WHERE r.is_active = true
    AND now() BETWEEN r.effective_from AND COALESCE(r.effective_to, now() + interval '1 year')
    AND r.level = p_level
    AND (
      -- Product-specific
      (r.product_id = p_product_id AND r.category_id IS NULL)
      -- Category-specific
      OR (r.product_id IS NULL AND r.category_id = p_category_id)
      -- Global
      OR (r.product_id IS NULL AND r.category_id IS NULL)
    )
    AND (r.rank_name IS NULL OR r.rank_name = p_rank_name)
  ORDER BY
    -- Specificity: product > category > global, rank-specific > rank-agnostic
    CASE
      WHEN r.product_id IS NOT NULL AND r.rank_name IS NOT NULL THEN 1
      WHEN r.product_id IS NOT NULL AND r.rank_name IS NULL THEN 2
      WHEN r.category_id IS NOT NULL AND r.rank_name IS NOT NULL THEN 3
      WHEN r.category_id IS NOT NULL AND r.rank_name IS NULL THEN 4
      WHEN r.product_id IS NULL AND r.category_id IS NULL AND r.rank_name IS NOT NULL THEN 5
      ELSE 6
    END
  LIMIT 1;
END;
$$;

-- =========================================================================
-- 4. RLS
-- =========================================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_commission_rules ENABLE ROW LEVEL SECURITY;

-- No partner access to system_settings (admin service role only)
-- No partner access to commission rules (admin service role only)
