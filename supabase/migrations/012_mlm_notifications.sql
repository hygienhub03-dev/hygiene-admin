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
