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
