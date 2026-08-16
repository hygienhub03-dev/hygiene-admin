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
