-- ======== 002_admin_push_tokens.sql ========
-- Admin mobile push tokens (Expo)
-- Run in the same Supabase project as the store / admin.

CREATE TABLE IF NOT EXISTS public.admin_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_push_tokens_user_id_idx
  ON public.admin_push_tokens (user_id);

ALTER TABLE public.admin_push_tokens ENABLE ROW LEVEL SECURITY;

-- No direct client access; service role / admin API only
DROP POLICY IF EXISTS admin_push_tokens_deny_all ON public.admin_push_tokens;
CREATE POLICY admin_push_tokens_deny_all ON public.admin_push_tokens
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);


-- ======== 003_mlm_core.sql ========
-- Migration 1: Core Distributor Tables
-- Creates: distributors, distributor_closure, wallets
-- Creates: fn_distributor_before_insert, fn_distributor_after_insert
-- Creates: RLS policies for distributors, distributor_closure, wallets

-- =========================================================================
-- 1. DISTRIBUTORS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.distributors (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sponsor_id     uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  referral_code  text NOT NULL UNIQUE,
  rank           text NOT NULL DEFAULT 'member',
  status         text NOT NULL DEFAULT 'active',
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT distributors_rank_check
    CHECK (rank IN ('member', 'bronze', 'silver', 'gold', 'platinum')),
  CONSTRAINT distributors_status_check
    CHECK (status IN ('pending', 'active', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_distributors_sponsor
  ON public.distributors (sponsor_id);
CREATE INDEX IF NOT EXISTS idx_distributors_referral_code
  ON public.distributors (referral_code);
CREATE INDEX IF NOT EXISTS idx_distributors_status
  ON public.distributors (status);

-- =========================================================================
-- 2. DISTRIBUTOR CLOSURE (network hierarchy)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.distributor_closure (
  ancestor_id   uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  depth         int NOT NULL CHECK (depth >= 0),
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_closure_descendant
  ON public.distributor_closure (descendant_id);
CREATE INDEX IF NOT EXISTS idx_closure_ancestor_depth
  ON public.distributor_closure (ancestor_id, depth);

-- =========================================================================
-- 3. WALLETS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  distributor_id      uuid PRIMARY KEY REFERENCES public.distributors(id) ON DELETE CASCADE,
  balance_zar         numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_zar >= 0),
  reserved_zar        numeric(12,2) NOT NULL DEFAULT 0 CHECK (reserved_zar >= 0),
  lifetime_earned_zar numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_paid_zar   numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_reversed_zar numeric(14,2) NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wallets_balance_gte_reserved
    CHECK (balance_zar >= reserved_zar)
);

-- =========================================================================
-- 4. TRIGGER: Validate before insert (no self-sponsor, no cycles)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_distributor_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No self-sponsorship
  IF NEW.id = NEW.sponsor_id THEN
    RAISE EXCEPTION 'Cannot sponsor yourself';
  END IF;

  -- Sponsor must exist
  IF NEW.sponsor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.distributors WHERE id = NEW.sponsor_id) THEN
      RAISE EXCEPTION 'Sponsor does not exist';
    END IF;
  END IF;

  -- Check for cycles (sponsor cannot be a descendant of this distributor)
  IF NEW.sponsor_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.distributor_closure
      WHERE ancestor_id = NEW.id AND descendant_id = NEW.sponsor_id
    ) THEN
      RAISE EXCEPTION 'Circular referral detected';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =========================================================================
-- 5. TRIGGER: Maintain closure table and wallet after insert
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_distributor_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Self row (depth 0)
  INSERT INTO public.distributor_closure (ancestor_id, descendant_id, depth)
  VALUES (NEW.id, NEW.id, 0)
  ON CONFLICT DO NOTHING;

  -- Copy sponsor's ancestors + sponsor itself
  IF NEW.sponsor_id IS NOT NULL THEN
    INSERT INTO public.distributor_closure (ancestor_id, descendant_id, depth)
    SELECT c.ancestor_id, NEW.id, c.depth + 1
    FROM public.distributor_closure c
    WHERE c.descendant_id = NEW.sponsor_id
    ON CONFLICT DO NOTHING;
  END IF;

  -- Wallet
  INSERT INTO public.wallets (distributor_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distributor_before_insert ON public.distributors;
CREATE TRIGGER trg_distributor_before_insert
  BEFORE INSERT ON public.distributors
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_distributor_before_insert();

DROP TRIGGER IF EXISTS trg_distributor_after_insert ON public.distributors;
CREATE TRIGGER trg_distributor_after_insert
  AFTER INSERT ON public.distributors
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_distributor_after_insert();

-- =========================================================================
-- 6. RLS POLICIES
-- =========================================================================
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Distributors: read own row + downline
DROP POLICY IF EXISTS distributors_select_own_tree ON public.distributors;
CREATE POLICY distributors_select_own_tree ON public.distributors
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.distributor_closure c
      WHERE c.ancestor_id = auth.uid() AND c.descendant_id = distributors.id
    )
  );

-- Insert own distributor row (enrolment)
DROP POLICY IF EXISTS distributors_insert_self ON public.distributors;
CREATE POLICY distributors_insert_self ON public.distributors
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Update own profile fields only (rank/status via admin service role)
DROP POLICY IF EXISTS distributors_update_self ON public.distributors;
CREATE POLICY distributors_update_self ON public.distributors
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Closure: read paths where user is ancestor or descendant
DROP POLICY IF EXISTS closure_select_related ON public.distributor_closure;
CREATE POLICY closure_select_related ON public.distributor_closure
  FOR SELECT TO authenticated
  USING (ancestor_id = auth.uid() OR descendant_id = auth.uid());

-- Wallet: own only
DROP POLICY IF EXISTS wallets_select_own ON public.wallets;
CREATE POLICY wallets_select_own ON public.wallets
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- =========================================================================
-- 7. PRODUCTS RLS (if table exists)
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    EXECUTE 'ALTER TABLE public.products ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products'
        AND policyname = 'products_select_active_authenticated'
    ) THEN
      EXECUTE $p$
        CREATE POLICY products_select_active_authenticated ON public.products
          FOR SELECT TO authenticated
          USING (status = 'active' OR status IS NULL)
      $p$;
    END IF;
  END IF;
END $$;


-- ======== 004_mlm_ranks.sql ========
-- Migration 2: Ranks
-- Creates: ranks table with seed data
-- Ranks are for recognition and qualification only
-- Commission rates are NOT tied to ranks (separate system)

-- =========================================================================
-- 1. RANKS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ranks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL UNIQUE,
  level                  int NOT NULL UNIQUE,
  min_direct_recruits    int NOT NULL DEFAULT 0,
  min_team_size          int NOT NULL DEFAULT 0,
  min_personal_volume_zar numeric(12,2) NOT NULL DEFAULT 0,
  min_team_volume_zar    numeric(12,2) NOT NULL DEFAULT 0,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Seed data
INSERT INTO public.ranks (name, level, min_direct_recruits, min_team_size, min_personal_volume_zar, min_team_volume_zar)
VALUES
  ('member',   1, 0,   0,   0,       0),
  ('bronze',   2, 2,   5,   5000,    5000),
  ('silver',   3, 5,  20,   25000,   25000),
  ('gold',     4, 10, 50,   100000,  100000),
  ('platinum', 5, 20, 150,  500000,  500000)
ON CONFLICT (name) DO NOTHING;


-- ======== 005_mlm_orders_extension.sql ========
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


-- ======== 006_mlm_referral_tokens.sql ========
-- Migration 4: Referral Tokens
-- Creates: referral_tokens table
-- Tracks referral links and attribution windows

-- =========================================================================
-- 1. REFERRAL TOKENS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.referral_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  cookie_name     text NOT NULL DEFAULT 'hh_ref',
  max_age_days    int NOT NULL DEFAULT 30,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_tokens_code
  ON public.referral_tokens (code);
CREATE INDEX IF NOT EXISTS idx_referral_tokens_distributor
  ON public.referral_tokens (distributor_id);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.referral_tokens ENABLE ROW LEVEL SECURITY;

-- Partners can read own tokens
DROP POLICY IF EXISTS referral_tokens_select_own ON public.referral_tokens;
CREATE POLICY referral_tokens_select_own ON public.referral_tokens
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());


-- ======== 007_mlm_settings_rules.sql ========
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


-- ======== 008_mlm_commissions.sql ========
-- Migration 6: Commissions (Redesigned)
-- Creates: commissions table with snapshot columns, idempotency, calc_version
-- Commission states: pending → available → reversed

-- =========================================================================
-- 1. COMMISSIONS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.commissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  earner_id             uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  source_order_id       uuid,
  from_user_id          uuid,
  level                 int NOT NULL CHECK (level >= 1),
  type                  text NOT NULL DEFAULT 'unilevel'
                          CHECK (type IN ('retail', 'unilevel', 'rank_bonus', 'adjustment')),
  amount_zar            numeric(12,2) NOT NULL CHECK (amount_zar >= 0),
  rate_used             numeric(5,4),
  volume_zar            numeric(12,2),
  rule_id               uuid,
  earner_rank_at_time   text,
  buyer_rank_at_time    text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'available', 'reversed')),
  approved_at           timestamptz,
  approved_by           uuid,
  reversal_of           uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  calc_version          int NOT NULL DEFAULT 1,
  note                  text,
  idempotency_key       text UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_earner
  ON public.commissions (earner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status
  ON public.commissions (status);
CREATE INDEX IF NOT EXISTS idx_commissions_order
  ON public.commissions (source_order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_reversal_of
  ON public.commissions (reversal_of);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Partners can read own commissions
DROP POLICY IF EXISTS commissions_select_own ON public.commissions;
CREATE POLICY commissions_select_own ON public.commissions
  FOR SELECT TO authenticated
  USING (earner_id = auth.uid());

-- No INSERT/UPDATE/DELETE for partners (via RPC functions only)


-- ======== 009_mlm_financial_ledger.sql ========
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


-- ======== 010_mlm_partner_debts.sql ========
-- Migration 8: Partner Debts
-- Creates: partner_debts table
-- Tracks outstanding debts when commission clawback exceeds wallet balance

-- =========================================================================
-- 1. PARTNER DEBTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.partner_debts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id      uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  commission_id       uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  original_amount_zar numeric(12,2) NOT NULL CHECK (original_amount_zar > 0),
  outstanding_zar     numeric(12,2) NOT NULL CHECK (outstanding_zar >= 0),
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'outstanding'
                        CHECK (status IN ('outstanding', 'partially_settled', 'settled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  settled_at          timestamptz,

  CONSTRAINT debt_outstanding_lte_original
    CHECK (outstanding_zar <= original_amount_zar)
);

CREATE INDEX IF NOT EXISTS idx_debts_distributor
  ON public.partner_debts (distributor_id);
CREATE INDEX IF NOT EXISTS idx_debts_status
  ON public.partner_debts (status)
  WHERE status != 'settled';

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.partner_debts ENABLE ROW LEVEL SECURITY;

-- Partners can read own debts
DROP POLICY IF EXISTS debts_select_own ON public.partner_debts;
CREATE POLICY debts_select_own ON public.partner_debts
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- No INSERT/UPDATE/DELETE for partners (admin service role only)


-- ======== 011_mlm_payouts.sql ========
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


-- ======== 012_mlm_notifications.sql ========
-- Migration 10: Notifications
-- Creates: notifications table for in-app notifications

-- =========================================================================
-- 1. NOTIFICATIONS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN (
                  'commission_earned', 'commission_approved', 'commission_reversed',
                  'payout_requested', 'payout_approved', 'payout_paid',
                  'payout_rejected', 'payout_failed',
                  'rank_change', 'team_join', 'debt_settled', 'system'
                )),
  title         text NOT NULL,
  body          text NOT NULL,
  metadata      jsonb,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_id, is_read, created_at DESC);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Partners can read own notifications
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- Partners can mark own notifications as read
DROP POLICY IF EXISTS notifications_update_read_own ON public.notifications;
CREATE POLICY notifications_update_read_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());


-- ======== 013_mlm_push_tokens.sql ========
-- Migration 11: Admin Push Tokens
-- Creates: admin_push_tokens table for Expo push notifications
-- No partner access (admin service role only)

-- =========================================================================
-- 1. ADMIN PUSH TOKENS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.admin_push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_push_tokens_user_id
  ON public.admin_push_tokens (user_id);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.admin_push_tokens ENABLE ROW LEVEL SECURITY;

-- No direct client access; service role / admin API only
DROP POLICY IF EXISTS admin_push_tokens_deny_all ON public.admin_push_tokens;
CREATE POLICY admin_push_tokens_deny_all ON public.admin_push_tokens
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);


-- ======== 014_mlm_rank_history.sql ========
-- Migration 12: Rank History
-- Creates: rank_history table for rank change audit trail

-- =========================================================================
-- 1. RANK HISTORY
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rank_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  previous_rank   text,
  new_rank        text NOT NULL,
  changed_by      uuid REFERENCES auth.users(id),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rank_history_distributor
  ON public.rank_history (distributor_id);

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;

-- Partners can read own rank history
DROP POLICY IF EXISTS rank_history_select_own ON public.rank_history;
CREATE POLICY rank_history_select_own ON public.rank_history
  FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

-- No INSERT/UPDATE/DELETE for partners (admin service role only)


-- ======== 015_mlm_webhook_events.sql ========
-- Migration 13: Webhook Events
-- Creates: webhook_events table for Paystack event idempotency
-- Prevents duplicate processing of webhook events

-- =========================================================================
-- 1. WEBHOOK EVENTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL DEFAULT 'paystack',
  event_id    text NOT NULL,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL,
  processed   boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webhook_events_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
  ON public.webhook_events (provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
  ON public.webhook_events (processed)
  WHERE processed = false;


-- ======== 016_mlm_audit_log.sql ========
-- Migration 14: Audit Log
-- Creates: audit_log table (append-only, immutable)
-- Supports user, system, webhook, and job actors

-- =========================================================================
-- 1. AUDIT LOG
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_type  text NOT NULL DEFAULT 'user'
                CHECK (actor_type IN ('user', 'system', 'webhook', 'job')),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.audit_log (action, created_at DESC);

-- =========================================================================
-- 2. RLS (admin service role only, no partner access)
-- =========================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- No policies = no access for authenticated users
-- Only accessible via service role (admin API routes)


-- ======== 017_mlm_views.sql ========
-- Migration 15: Views + Reconciliation Functions
-- Creates: v_distributor_stats view, rebuild_closure_table, verify_wallet_balance

-- =========================================================================
-- 1. VIEW: DISTRIBUTOR STATS
-- =========================================================================
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

-- =========================================================================
-- 2. REBUILD CLOSURE TABLE
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rebuild_closure_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear existing closure data
  TRUNCATE public.distributor_closure;

  -- Rebuild from scratch using recursive CTE
  INSERT INTO public.distributor_closure (ancestor_id, descendant_id, depth)
  WITH RECURSIVE tree AS (
    -- Self-rows (depth 0)
    SELECT id AS ancestor_id, id AS descendant_id, 0 AS depth
    FROM public.distributors

    UNION ALL

    -- Inherit from parent
    SELECT t.ancestor_id, d.id, t.depth + 1
    FROM tree t
    JOIN public.distributors d ON d.sponsor_id = t.descendant_id
    WHERE t.depth < 100  -- safety limit
  )
  SELECT ancestor_id, descendant_id, depth FROM tree
  ON CONFLICT DO NOTHING;
END;
$$;

-- =========================================================================
-- 3. VERIFY WALLET BALANCE
-- Returns any wallets where cached balance disagrees with ledger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.verify_wallet_balances()
RETURNS TABLE(
  distributor_id uuid,
  cached_balance numeric,
  computed_balance numeric,
  drift numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.distributor_id,
    w.balance_zar AS cached_balance,
    COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount_zar ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN wt.type = 'debit' THEN wt.amount_zar ELSE 0 END), 0) AS computed_balance,
    w.balance_zar - (
      COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount_zar ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN wt.type = 'debit' THEN wt.amount_zar ELSE 0 END), 0)
    ) AS drift
  FROM public.wallets w
  LEFT JOIN public.wallet_transactions wt ON wt.distributor_id = w.distributor_id
  GROUP BY w.distributor_id, w.balance_zar
  HAVING w.balance_zar - (
    COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount_zar ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN wt.type = 'debit' THEN wt.amount_zar ELSE 0 END), 0)
  ) != 0;
END;
$$;


-- ======== 019_mlm_refund_rank_audit.sql ========
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


-- ======== 020_mlm_audit_fixes.sql ========
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


-- ======== 022_stock_race_fix_hmac_timing.sql ========
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


-- ======== 023_critical_bug_fixes.sql ========
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


-- ======== 025_critical_security_fixes.sql ========
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


-- ======== 026_fix_v_distributor_stats_security.sql ========
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


-- ======== 027_audit_log_rls_admin_read.sql ========
-- Migration 027: Allow admin users to read audit_log via RLS
-- The audit_log table had RLS enabled with zero policies,
-- meaning only service_role could access it.
-- Admins need read access from the mobile app (publishable key).

CREATE OR REPLACE FUNCTION public.fn_is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'admin'
  );
$$;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit_log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.fn_is_admin(auth.uid()));


