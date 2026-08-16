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
