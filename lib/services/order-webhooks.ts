/**
 * Outgoing webhooks for order status / shipment changes.
 * Failures are logged and never block the admin status update.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

export type OrderWebhookEventType =
  | "order.status_changed"
  | "order.shipment_changed"
  | "order.updated"

export interface OrderWebhookPayload {
  event: OrderWebhookEventType
  timestamp: string
  order: {
    id: string
    userEmail?: string | null
    status: string | null
    previousStatus?: string | null
    shipmentStatus?: string | null
    previousShipmentStatus?: string | null
    trackingNumber?: string | null
    carrier?: string | null
    note?: string | null
  }
}

export interface WebhookDeliveryResult {
  url: string
  ok: boolean
  status?: number
  error?: string
  event: OrderWebhookEventType
}

export interface OrderWebhookContext {
  orderId: string
  userEmail?: string | null
  orderStatus?: string
  previousOrderStatus?: string | null
  shipmentStatus?: string
  previousShipmentStatus?: string | null
  trackingNumber?: string | null
  carrier?: string | null
  note?: string | null
}

/** Parse ORDER_WEBHOOK_URLS (comma-separated). Empty / invalid entries dropped. */
export function getWebhookUrls(
  raw: string | undefined = process.env.ORDER_WEBHOOK_URLS,
): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      try {
        const u = new URL(s)
        return u.protocol === "https:" || u.protocol === "http:"
      } catch {
        return false
      }
    })
}

/**
 * Decide which webhook events to fire for this update.
 * Fires only on genuine transitions (same rule as customer emails).
 */
export function resolveWebhookEvents(
  ctx: Pick<
    OrderWebhookContext,
    | "orderStatus"
    | "previousOrderStatus"
    | "shipmentStatus"
    | "previousShipmentStatus"
  >,
): OrderWebhookEventType[] {
  const events: OrderWebhookEventType[] = []

  if (
    ctx.orderStatus &&
    ctx.orderStatus !== ctx.previousOrderStatus
  ) {
    events.push("order.status_changed")
  }

  if (
    ctx.shipmentStatus &&
    ctx.shipmentStatus !== ctx.previousShipmentStatus
  ) {
    events.push("order.shipment_changed")
  }

  // Generic catch-all when either field changed (or tracking/carrier alone).
  // Callers pass tracking-only updates with no status change — still useful.
  return events
}

export function buildWebhookPayload(
  ctx: OrderWebhookContext,
  event: OrderWebhookEventType,
  now: Date = new Date(),
): OrderWebhookPayload {
  return {
    event,
    timestamp: now.toISOString(),
    order: {
      id: ctx.orderId,
      userEmail: ctx.userEmail ?? null,
      status: ctx.orderStatus ?? null,
      previousStatus: ctx.previousOrderStatus ?? null,
      shipmentStatus: ctx.shipmentStatus ?? null,
      previousShipmentStatus: ctx.previousShipmentStatus ?? null,
      trackingNumber: ctx.trackingNumber ?? null,
      carrier: ctx.carrier ?? null,
      note: ctx.note ?? null,
    },
  }
}

/**
 * HMAC-SHA256 signature of the raw body, hex-encoded.
 * Header: X-Hygienhub-Signature: sha256=<hex>
 */
export function signWebhookBody(
  body: string,
  secret: string,
): string {
  const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex")
  return `sha256=${digest}`
}

/** Verify a signature from a receiving endpoint (for tests / storefront). */
export function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = signWebhookBody(body, secret)
  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(signatureHeader)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function logWebhookEvent(
  supabase: SupabaseClient | null,
  payload: {
    url: string
    event: string
    orderId: string
    status: "sent" | "failed"
    httpStatus?: number
    error?: string
  },
) {
  if (!supabase) return
  try {
    await supabase.from("email_events").insert({
      type: `webhook:${payload.event}`,
      recipient: payload.url,
      subject: `Webhook ${payload.event}`,
      status: payload.status,
      metadata: {
        order_id: payload.orderId,
        http_status: payload.httpStatus,
        ...(payload.error ? { error: payload.error } : {}),
      },
    })
  } catch (err) {
    console.warn("[order-webhooks] log insert skipped", err)
  }
}

/**
 * POST the payload to a single URL. Timeout 8s.
 */
export async function deliverWebhook(
  url: string,
  payload: OrderWebhookPayload,
  options?: {
    secret?: string
    fetchImpl?: typeof fetch
    timeoutMs?: number
  },
): Promise<WebhookDeliveryResult> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "HygienHub-Admin-Webhooks/1.0",
    "X-Hygienhub-Event": payload.event,
    "X-Hygienhub-Delivery-Id": `${payload.order.id}-${payload.event}-${payload.timestamp}`,
  }

  const secret = options?.secret ?? process.env.ORDER_WEBHOOK_SECRET
  if (secret) {
    headers["X-Hygienhub-Signature"] = signWebhookBody(body, secret)
  }

  const fetchImpl = options?.fetchImpl ?? fetch
  const timeoutMs = options?.timeoutMs ?? 8_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        url,
        ok: false,
        status: res.status,
        event: payload.event,
        error: text.slice(0, 200) || res.statusText,
      }
    }

    return {
      url,
      ok: true,
      status: res.status,
      event: payload.event,
    }
  } catch (err: any) {
    const message =
      err?.name === "AbortError"
        ? `timeout after ${timeoutMs}ms`
        : err?.message ?? String(err)
    return {
      url,
      ok: false,
      event: payload.event,
      error: message,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fire webhooks for an order update. No-ops when ORDER_WEBHOOK_URLS is empty
 * or there is no status/shipment transition.
 */
export async function dispatchOrderWebhooks(
  supabase: SupabaseClient | null,
  ctx: OrderWebhookContext,
  options?: {
    urls?: string[]
    secret?: string
    fetchImpl?: typeof fetch
  },
): Promise<WebhookDeliveryResult[]> {
  const urls = options?.urls ?? getWebhookUrls()
  if (!urls.length) return []

  const events = resolveWebhookEvents(ctx)

  // Tracking-only update with no status change: still emit a generic event
  // so integrators can sync tracking numbers.
  if (
    events.length === 0 &&
    (ctx.trackingNumber !== undefined || ctx.carrier !== undefined) &&
    !ctx.orderStatus &&
    !ctx.shipmentStatus
  ) {
    events.push("order.updated")
  }

  if (!events.length) return []

  const results: WebhookDeliveryResult[] = []

  for (const event of events) {
    const payload = buildWebhookPayload(ctx, event)
    for (const url of urls) {
      const result = await deliverWebhook(url, payload, {
        secret: options?.secret,
        fetchImpl: options?.fetchImpl,
      })
      results.push(result)
      await logWebhookEvent(supabase, {
        url,
        event,
        orderId: ctx.orderId,
        status: result.ok ? "sent" : "failed",
        httpStatus: result.status,
        error: result.error,
      })
      if (!result.ok) {
        console.error("[order-webhooks] delivery failed", result)
      }
    }
  }

  return results
}
