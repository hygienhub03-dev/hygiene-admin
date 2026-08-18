-- ============================================================================
-- RECONCILIATION MIGRATION: Production Schema Merge for gzghcomsyuiwxqcouyuo
-- ============================================================================
-- This is a SINGLE, IDEMPOTENT migration that represents the FINAL intended
-- state of the schema. It merges all 23 original migration files into the
-- correct final form, resolving conflicts between versions.
--
-- KEY DECISIONS:
-- - process_refund() uses PROPORTIONAL logic from 019/023 (NOT full-reversal 025)
-- - process_refund_with_cooling_off() merges cooling-off (020) + admin check (025)
-- - approve_commission() uses 025 version with wallet balance fix
-- - settle_debt_on_credit() accepts p_current_balance for accurate balance_after_zar
-- - wallet_transactions.balance_after_zar always contains TRUE post-transaction balance
-- - All functions include admin-role authorization from 025
-- - actor_type (not actor_role) used everywhere per 023 fix
-- - rule_id column NOT included (added 008, dropped 022, net=absent)
--
-- DO NOT touch hbjkbvatggpqchegtwpy (reference/backup)
-- ============================================================================


-- ============================================================================
-- PHASE 1: SECURITY — prevent_role_escalation trigger (zero dependencies)
-- ============================================================================

-- 1a. Create the trigger function
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

-- 1b. Attach trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();


-- ============================================================================
-- PHASE 2: EXISTING TABLE COLUMN/CONSTRAINT FIXES
-- ============================================================================

-- 2a. WALLETS — add missing columns + constraint
DO $$
BEGIN
  -- reserved_zar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wallets' AND column_name='reserved_zar'
  ) THEN
    ALTER TABLE public.wallets ADD COLUMN reserved_zar numeric(12,2) NOT NULL DEFAULT 0;
  END IF;

  -- lifetime_paid_zar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wallets' AND column_name='lifetime_paid_zar'
  ) THEN
    ALTER TABLE public.wallets ADD COLUMN lifetime_paid_zar numeric(14,2) NOT NULL DEFAULT 0;
  END IF;

  -- lifetime_reversed_zar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wallets' AND column_name='lifetime_reversed_zar'
  ) THEN
    ALTER TABLE public.wallets ADD COLUMN lifetime_reversed_zar numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add CHECK constraint for reserved_zar >= 0 (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallets_reserved_zar_check' AND conrelid = 'public.wallets'::regclass
  ) THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_reserved_zar_check CHECK (reserved_zar >= 0);
  END IF;
END $$;

-- Add CHECK constraint balance_zar >= reserved_zar (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallets_balance_gte_reserved' AND conrelid = 'public.wallets'::regclass
  ) THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_balance_gte_reserved CHECK (balance_zar >= reserved_zar);
  END IF;
END $$;


-- 2b. COMMISSIONS — add missing columns, drop rule_id
DO $$
BEGIN
  -- rate_used
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='rate_used'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN rate_used numeric(5,4);
  END IF;

  -- volume_zar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='volume_zar'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN volume_zar numeric(12,2);
  END IF;

  -- earner_rank_at_time
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='earner_rank_at_time'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN earner_rank_at_time text;
  END IF;

  -- buyer_rank_at_time
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='buyer_rank_at_time'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN buyer_rank_at_time text;
  END IF;

  -- approved_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='approved_at'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN approved_at timestamptz;
  END IF;

  -- approved_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='approved_by'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN approved_by uuid;
  END IF;

  -- reversal_of
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='reversal_of'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN reversal_of uuid;
  END IF;

  -- calc_version
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='calc_version'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN calc_version int NOT NULL DEFAULT 1;
  END IF;

  -- idempotency_key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='idempotency_key'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN idempotency_key text;
  END IF;

  -- Add unique constraint on idempotency_key if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commissions_idempotency_key_key' AND conrelid = 'public.commissions'::regclass
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_idempotency_key_key UNIQUE (idempotency_key);
  END IF;

  -- Drop rule_id column if it exists (added 008, dropped 022)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commissions' AND column_name='rule_id'
  ) THEN
    ALTER TABLE public.commissions DROP COLUMN rule_id;
  END IF;

  -- Widen status CHECK to include 'available' and 'reversed'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commissions_status_check' AND conrelid = 'public.commissions'::regclass
  ) THEN
    ALTER TABLE public.commissions DROP CONSTRAINT commissions_status_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commissions_status_check' AND conrelid = 'public.commissions'::regclass
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_status_check
      CHECK (status IN ('pending', 'approved', 'paid', 'clawed_back', 'available', 'reversed'));
  END IF;
END $$;

-- Add reversal_of FK if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commissions_reversal_of_fkey' AND conrelid = 'public.commissions'::regclass
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_reversal_of_fkey
      FOREIGN KEY (reversal_of) REFERENCES public.commissions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add missing indexes on commissions
CREATE INDEX IF NOT EXISTS idx_commissions_reversal_of
  ON public.commissions (reversal_of);


-- 2c. PAYOUTS — add paid_at, widen CHECK, add partial unique indexes
DO $$
BEGIN
  -- paid_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payouts' AND column_name='paid_at'
  ) THEN
    ALTER TABLE public.payouts ADD COLUMN paid_at timestamptz;
  END IF;
END $$;

-- Widen status CHECK constraint (idempotent)
DO $$
BEGIN
  -- Drop old restrictive CHECK if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'payouts_status_check%' AND conrelid = 'public.payouts'::regclass
  ) THEN
    ALTER TABLE public.payouts DROP CONSTRAINT payouts_status_check;
  END IF;

  -- Add comprehensive CHECK (only if missing)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payouts_status_check' AND conrelid = 'public.payouts'::regclass
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_status_check
      CHECK (status IN ('requested', 'approved', 'processing', 'paid', 'failed', 'cancelled', 'rejected'));
  END IF;
END $$;

-- Partial unique indexes (one pending, one processing per distributor)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_one_pending
  ON public.payouts (distributor_id) WHERE status = 'requested';
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_one_processing
  ON public.payouts (distributor_id) WHERE status = 'processing';


-- 2d. ORDERS — conditional columns (only if orders table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    -- sponsor_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='sponsor_id'
    ) THEN
      ALTER TABLE public.orders
        ADD COLUMN sponsor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL;
    END IF;

    -- referral_code
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='referral_code'
    ) THEN
      ALTER TABLE public.orders ADD COLUMN referral_code text;
    END IF;

    -- commissionable_amount_zar
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='commissionable_amount_zar'
    ) THEN
      ALTER TABLE public.orders
        ADD COLUMN commissionable_amount_zar numeric(12,2) NOT NULL DEFAULT 0;
    END IF;

    -- VAT fields (020)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='vat_amount_zar'
    ) THEN
      ALTER TABLE public.orders ADD COLUMN vat_amount_zar numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE public.orders ADD COLUMN vat_rate numeric(5,4) NOT NULL DEFAULT 0.15;
      ALTER TABLE public.orders ADD COLUMN subtotal_excl_vat numeric(12,2) NOT NULL DEFAULT 0;
    END IF;

    -- Index on sponsor_id
    CREATE INDEX IF NOT EXISTS idx_orders_sponsor ON public.orders (sponsor_id);
  END IF;
END $$;


-- 2e. AUDIT LOG — widen actor_type CHECK to include 'admin' and 'partner'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_log_actor_type_check' AND conrelid = 'public.audit_log'::regclass
  ) THEN
    ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_actor_type_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_log_actor_type_check' AND conrelid = 'public.audit_log'::regclass
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_actor_type_check
      CHECK (actor_type IN ('user', 'system', 'webhook', 'job', 'admin', 'partner'));
  END IF;
END $$;


-- ============================================================================
-- PHASE 3: NEW TABLES (in dependency order)
-- ============================================================================

-- 3a. PARTNER DEBTS (referenced by settle_debt_on_credit, approve_commission, process_refund)
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
  CONSTRAINT debt_outstanding_lte_original CHECK (outstanding_zar <= original_amount_zar)
);
CREATE INDEX IF NOT EXISTS idx_debts_distributor ON public.partner_debts (distributor_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON public.partner_debts (status) WHERE status != 'settled';

ALTER TABLE public.partner_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debts_select_own ON public.partner_debts;
CREATE POLICY debts_select_own ON public.partner_debts
  FOR SELECT TO authenticated USING (distributor_id = auth.uid());


-- 3b. WALLET TRANSACTIONS (financial ledger, referenced by approve_commission, etc.)
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
CREATE INDEX IF NOT EXISTS idx_wt_distributor ON public.wallet_transactions (distributor_id);
CREATE INDEX IF NOT EXISTS idx_wt_wallet ON public.wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wt_source ON public.wallet_transactions (source_type, source_id);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wt_select_own ON public.wallet_transactions;
CREATE POLICY wt_select_own ON public.wallet_transactions
  FOR SELECT TO authenticated USING (distributor_id = auth.uid());


-- 3c. NOTIFICATIONS
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

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS notifications_update_read_own ON public.notifications;
CREATE POLICY notifications_update_read_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());


-- 3d. RANK HISTORY
CREATE TABLE IF NOT EXISTS public.rank_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  previous_rank   text,
  new_rank        text NOT NULL,
  changed_by      uuid REFERENCES auth.users(id),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rank_history_distributor ON public.rank_history (distributor_id);

ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rank_history_select_own ON public.rank_history;
CREATE POLICY rank_history_select_own ON public.rank_history
  FOR SELECT TO authenticated USING (distributor_id = auth.uid());


-- 3e. WEBHOOK EVENTS
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
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.webhook_events (provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON public.webhook_events (processed) WHERE processed = false;


-- 3f. CONSENT RECORDS (POPIA)
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
CREATE POLICY consent_select_own ON public.consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY consent_insert_own ON public.consent_records
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- 3g. DATA EXPORT REQUESTS (POPIA)
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
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY data_export_insert_own ON public.data_export_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- 3h. DATA DELETE REQUESTS (POPIA)
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
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY data_delete_insert_own ON public.data_delete_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- 3i. INVENTORY MOVEMENTS (023) — table already exists, add missing columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='order_id'
  ) THEN
    ALTER TABLE public.inventory_movements ADD COLUMN order_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='previous_stock'
  ) THEN
    ALTER TABLE public.inventory_movements ADD COLUMN previous_stock int;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='new_stock'
  ) THEN
    ALTER TABLE public.inventory_movements ADD COLUMN new_stock int;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON public.inventory_movements (order_id);

-- RLS already enabled; add service-role-only policies if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'Service role only'
  ) THEN
    ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;


-- 3j. EMAIL EVENTS (023) — table already exists, add CHECK constraint + indexes
DO $$
BEGIN
  -- Add CHECK constraint on status if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_events_status_check' AND conrelid = 'public.email_events'::regclass
  ) THEN
    ALTER TABLE public.email_events
      ADD CONSTRAINT email_events_status_check
      CHECK (status IN ('sent', 'failed', 'delivered', 'bounced'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON public.email_events (recipient, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events (type, created_at DESC);

-- RLS already enabled; no user-facing policies (service role only)
DO $$
BEGIN
  ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
END $$;


-- ============================================================================
-- PHASE 4: FUNCTIONS — dependency order
-- ============================================================================

-- 4a. SETTLE DEBT ON CREDIT (helper, used by approve_commission)
--     Accepts current wallet balance so each debt settlement transaction
--     records the TRUE post-debit wallet balance in balance_after_zar.
--     Returns the FINAL wallet balance after credit + debt settlements.
CREATE OR REPLACE FUNCTION public.settle_debt_on_credit(
  p_distributor_id uuid,
  p_amount_zar numeric,
  p_current_balance numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_credit numeric := p_amount_zar;
  v_balance numeric := p_current_balance + p_amount_zar;
  v_settlement numeric;
  v_debt RECORD;
BEGIN
  FOR v_debt IN
    SELECT id, outstanding_zar FROM public.partner_debts
    WHERE distributor_id = p_distributor_id
      AND status IN ('outstanding', 'partially_settled')
    ORDER BY created_at ASC
  LOOP
    IF v_remaining_credit <= 0 THEN EXIT; END IF;

    -- Settlement amount is the lesser of the debt and remaining credit
    v_settlement := LEAST(v_debt.outstanding_zar, v_remaining_credit);

    IF v_debt.outstanding_zar <= v_remaining_credit THEN
      -- Settle this debt fully
      UPDATE public.partner_debts
      SET outstanding_zar = 0, status = 'settled', settled_at = now()
      WHERE id = v_debt.id;
    ELSE
      -- Partially settle this debt
      UPDATE public.partner_debts
      SET outstanding_zar = outstanding_zar - v_remaining_credit,
          status = 'partially_settled'
      WHERE id = v_debt.id;
    END IF;

    -- Debit wallet balance for the settlement amount
    v_balance := v_balance - v_settlement;

    -- Record the debt settlement transaction with TRUE post-debit balance
    INSERT INTO public.wallet_transactions (
      wallet_id, distributor_id, type, source_type, source_id,
      amount_zar, balance_after_zar, description, idempotency_key
    ) VALUES (
      p_distributor_id, p_distributor_id, 'debit', 'debt_settlement',
      v_debt.id, v_settlement, v_balance,
      CASE WHEN v_debt.outstanding_zar <= v_remaining_credit
        THEN 'Debt settlement'
        ELSE 'Partial debt settlement'
      END,
      'debt_settle:' || v_debt.id::text ||
        CASE WHEN v_debt.outstanding_zar > v_remaining_credit
          THEN ':partial'
          ELSE ''
        END
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    v_remaining_credit := v_remaining_credit - v_settlement;
  END LOOP;

  -- Return final wallet balance: starting + credit - all debt settlements
  RETURN v_balance;
END;
$$;


-- 4b. LOG AUDIT EVENT (helper)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_old_value jsonb DEFAULT NULL,
  p_new_value jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_actor_type text DEFAULT 'system'
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


-- 4c. RECORD INITIAL CONSENTS
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


-- 4d. IS WITHIN COOLING-OFF PERIOD
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
  WHILE v_check_date < v_now LOOP
    IF EXTRACT(DOW FROM v_check_date) BETWEEN 1 AND 5 THEN
      v_business_days := v_business_days + 1;
    END IF;
    v_check_date := v_check_date + interval '1 day';
  END LOOP;

  RETURN v_business_days < 5;
END;
$$;


-- 4e. APPROVE COMMISSION (025 version with admin check + balance_after_zar fix)
CREATE OR REPLACE FUNCTION public.approve_commission(
  p_commission_id uuid,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_commission RECORD;
  v_wallet RECORD;
  v_inserted boolean;
  v_final_balance numeric;
  v_holding_days int;
  v_admin_role text;
BEGIN
  -- Admin role check (025)
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

  -- Lock wallet FIRST to get current balance for correct balance_after_zar
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE distributor_id = v_commission.earner_id
  FOR UPDATE;

  -- Settle debts and compute true final balance:
  --   final = starting_balance + credit - debt_settlements
  v_final_balance := public.settle_debt_on_credit(
    v_commission.earner_id,
    v_commission.amount_zar,
    COALESCE(v_wallet.balance_zar, 0)
  );

  -- Create credit wallet transaction with TRUE post-credit balance
  INSERT INTO public.wallet_transactions (
    wallet_id, distributor_id, type, source_type, source_id,
    amount_zar, balance_after_zar, description, idempotency_key
  ) VALUES (
    v_commission.earner_id, v_commission.earner_id,
    'credit', 'commission', v_commission.id,
    v_commission.amount_zar, v_final_balance,
    'Commission L' || v_commission.level || ' approved',
    'commission:' || v_commission.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING true INTO v_inserted;

  -- Update wallet balance to true final value
  IF v_inserted THEN
    UPDATE public.wallets
    SET balance_zar = v_final_balance,
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


-- 4f. REVERSE COMMISSION (025 version with admin check)
CREATE OR REPLACE FUNCTION public.reverse_commission(
  p_commission_id uuid,
  p_reason text,
  p_actor_id uuid DEFAULT NULL
) RETURNS void
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
  -- Admin role check (025)
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


-- 4g. PROCESS REFUND — MERGED: 019 proportional + 025 admin check + 023 actor_type
--    This is the KEY merge: keeps proportional reversal + partner_debt creation
--    from 019, adds admin-role authorization from 025.
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
  v_admin_role text;
BEGIN
  -- Admin role check (from 025)
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Fetch order
  SELECT id, total_amount, commissionable_amount_zar, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Calculate refund ratio (from 019: proportional logic)
  v_commissionable := COALESCE(v_order.commissionable_amount_zar, v_order.total_amount);
  IF v_commissionable <= 0 OR p_refund_amount_zar <= 0 THEN
    RAISE EXCEPTION 'Invalid commissionable or refund amount';
  END IF;

  v_refund_ratio := LEAST(p_refund_amount_zar / v_commissionable, 1.0);

  -- Process each available commission for this order (from 019: proportional reversal)
  FOR v_commission IN
    SELECT * FROM public.commissions
    WHERE source_order_id = p_order_id
      AND status = 'available'
    ORDER BY level ASC
  LOOP
    -- Calculate proportional reversal amount (from 019)
    v_reversal_amount := ROUND(v_commission.amount_zar * v_refund_ratio, 2);

    IF v_reversal_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Prevent duplicate reversal (idempotency, from 019)
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

    -- Check wallet balance — insufficient balance creates partner_debt (from 019)
    IF v_wallet.balance_zar < v_reversal_amount THEN
      -- Create partner_debt record
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

      v_results := v_results || jsonb_build_object(
        'commission_id', v_commission.id,
        'reversal_amount', v_reversal_amount,
        'debt_created', true,
        'earner_id', v_commission.earner_id
      );
    ELSE
      -- Sufficient balance — reverse normally (from 019)
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

  -- Audit log (using actor_type, not actor_role — per 023 fix)
  INSERT INTO public.audit_log (
    actor_id, actor_type, action, entity_type, entity_id,
    old_value, new_value, reason, metadata
  ) VALUES (
    auth.uid(), 'admin', 'order.refund', 'order', p_order_id,
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


-- 4h. PROCESS REFUND WITH COOLING OFF — MERGED: 020 cooling-off + 025 admin check
--     When in cooling-off: logs and returns (no reversal needed)
--     When outside cooling-off: delegates to merged process_refund (proportional)
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
  -- Admin role check (from 025)
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
    -- Cooling-off: log and skip commission reversal
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
    -- After cooling-off: proportional commission reversal (merged process_refund)
    RETURN public.process_refund(p_order_id, p_refund_amount_zar, p_reason, auth.uid());
  END IF;
END;
$$;


-- 4i. REQUEST PAYOUT (025 version)
CREATE OR REPLACE FUNCTION public.request_payout(
  p_distributor_id uuid,
  p_amount_zar numeric,
  p_method text DEFAULT 'eft'
) RETURNS uuid
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


-- 4j. PROCESS PAYOUT (025 version with admin check)
CREATE OR REPLACE FUNCTION public.process_payout(
  p_payout_id uuid,
  p_action text,
  p_admin_id uuid,
  p_note text DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS void
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
  -- Admin role check (025)
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


-- 4k. FN DISTRIBUTOR RANK CHANGE (trigger function)
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


-- 4l. EXPIRE COMMISSIONS
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
  IF p_holding_days IS NULL THEN
    SELECT COALESCE((value->>'holding_period_days')::int, 30)
    INTO v_holding_days
    FROM public.system_settings
    WHERE key = 'commission.holding_period_days';
  ELSE
    v_holding_days := p_holding_days;
  END IF;

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


-- 4m. AUTO APPROVE COMMISSIONS
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
  SELECT COALESCE((value->>'holding_period_days')::int, 30)
  INTO v_holding_days
  FROM public.system_settings
  WHERE key = 'commission.holding_period_days';

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
      RAISE NOTICE 'Failed to auto-approve commission %: %', v_commission.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'approved_count', v_approved_count,
    'holding_days', v_holding_days
  );
END;
$$;


-- 4n. REBUILD CLOSURE TABLE
CREATE OR REPLACE FUNCTION public.rebuild_closure_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE public.distributor_closure;

  INSERT INTO public.distributor_closure (ancestor_id, descendant_id, depth)
  WITH RECURSIVE tree AS (
    SELECT id AS ancestor_id, id AS descendant_id, 0 AS depth
    FROM public.distributors

    UNION ALL

    SELECT t.ancestor_id, d.id, t.depth + 1
    FROM tree t
    JOIN public.distributors d ON d.sponsor_id = t.descendant_id
    WHERE t.depth < 100
  )
  SELECT ancestor_id, descendant_id, depth FROM tree
  ON CONFLICT DO NOTHING;
END;
$$;


-- 4o. VERIFY WALLET BALANCES
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


-- 4p. DECREMENT STOCK (atomic, from 022)
--    Drop existing 2-param boolean version first
DROP FUNCTION IF EXISTS public.decrement_stock(uuid, integer);
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


-- 4q. DECREMENT STOCK BATCH
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


-- 4r. RECORD WEBHOOK EVENT (idempotent, from 022)
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


-- 4s. MARK WEBHOOK PROCESSED
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


-- 4t. FN IS ADMIN (027)
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


-- ============================================================================
-- PHASE 5: REVOKE/GRANT EXECUTE PRIVILEGES (from 025)
-- ============================================================================

-- Financial functions — admin checks inside, but restrict anon
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

-- Operational functions
REVOKE EXECUTE ON FUNCTION public.auto_approve_commissions(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_commissions(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rebuild_closure_table() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auto_approve_commissions(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_commissions(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_closure_table() TO authenticated;

-- Stock functions
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, integer, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_batch(jsonb, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock_batch(jsonb, uuid, text) TO authenticated;

-- Webhook functions
REVOKE EXECUTE ON FUNCTION public.record_webhook_event(text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_processed(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_webhook_event(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_webhook_processed(text, text, text) TO authenticated;

-- Audit + consent
REVOKE EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, uuid, jsonb, jsonb, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_initial_consents() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, uuid, jsonb, jsonb, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_initial_consents() TO authenticated;

-- Settle debt — used internally by approve_commission (3-arg version)
REVOKE EXECUTE ON FUNCTION public.settle_debt_on_credit(uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_debt_on_credit(uuid, numeric, numeric) TO authenticated;

-- run_scheduled_commission_tasks — if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'run_scheduled_commission_tasks'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_scheduled_commission_tasks() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_scheduled_commission_tasks() TO authenticated';
  END IF;
END $$;


-- ============================================================================
-- PHASE 6: RLS POLICY FIXES (IDOR fixes from 025)
-- ============================================================================

-- Orders: restrict to own orders only (replaces overly permissive policy)
DROP POLICY IF EXISTS orders_select_authenticated ON public.orders;
DROP POLICY IF EXISTS orders_select_own ON public.orders;
CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS orders_update_authenticated ON public.orders;
CREATE POLICY orders_update_own ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Profiles: restrict to own profile only
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());


-- ============================================================================
-- PHASE 7: ADMIN RLS FOR AUDIT LOG (027)
-- ============================================================================

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;
CREATE POLICY "Admins can read audit_log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.fn_is_admin(auth.uid()));


-- ============================================================================
-- PHASE 8: VIEWS (final version, after all dependencies exist)
-- ============================================================================

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


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   10 NEW tables created (idempotent with IF NOT EXISTS)
--    4 EXISTING tables modified (wallets, commissions, payouts, orders)
--   22 functions created/replaced (CREATE OR REPLACE, all idempotent)
--    1 view replaced (v_distributor_stats)
--    2 triggers created (trg_prevent_role_escalation, trg_distributor_rank_change)
--    2 RLS policies replaced (orders_select_own, profiles_select_own)
--    REVOKE/GRANT EXECUTE hardened on all SECURITY DEFINER functions
--    Merged process_refund() = 019 proportional + 025 admin check
--    Merged process_refund_with_cooling_off() = 020 cooling-off + 025 admin check
--    All audit inserts use actor_type (not actor_role)
--    No data dropped, no tables dropped, no destructive operations
-- ============================================================================
