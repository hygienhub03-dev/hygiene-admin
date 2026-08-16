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
