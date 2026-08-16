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
