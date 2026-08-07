/**
 * Order status → customer email orchestration.
 * Keeps the route handler thin and makes notification decisions testable.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  sendEmail,
  buildShippedEmail,
  buildDeliveredEmail,
  buildProcessingEmail,
} from "@hygienhub/order-emails"
import {
  shouldNotifyShipmentChange,
  shouldNotifyOrderStatusChange,
  type NotifiableOrderStatus,
} from "@/lib/services/order-status"

export interface OrderEmailContext {
  orderId: string
  userEmail: string
  orderStatus?: string
  previousOrderStatus?: string | null
  shipmentStatus?: string
  previousShipmentStatus?: string | null
  trackingNumber?: string | null
  carrier?: string | null
  firstName?: string | null
}

export interface NotificationResult {
  type: string
  sent: boolean
  error?: string
}

function shortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase()
}

async function logEmailEvent(
  supabase: SupabaseClient,
  payload: {
    type: string
    recipient: string
    subject: string
    status: "sent" | "failed"
    orderId: string
    error?: string
  },
) {
  try {
    await supabase.from("email_events").insert({
      type: payload.type,
      recipient: payload.recipient,
      subject: payload.subject,
      status: payload.status,
      metadata: {
        order_id: payload.orderId,
        ...(payload.error ? { error: payload.error } : {}),
      },
    })
  } catch (err) {
    console.error("[order-notifications] failed to log email_events row", err)
  }
}

/**
 * Sends shipped / delivered customer emails when shipment_status transitions.
 * Safe to call on every status update — only fires on genuine transitions.
 */
export async function notifyShipmentStatusChange(
  supabase: SupabaseClient,
  ctx: OrderEmailContext,
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = []

  const shouldNotify = shouldNotifyShipmentChange(
    ctx.shipmentStatus,
    ctx.previousShipmentStatus,
  )

  if (!shouldNotify || !ctx.userEmail || !ctx.shipmentStatus) {
    return results
  }

  const id = ctx.orderId

  if (ctx.shipmentStatus === "shipped") {
    const subject = `Your Order Has Shipped – #${shortOrderId(id)} | Hygien Hub`
    try {
      await sendEmail(supabase, {
        to: ctx.userEmail,
        subject,
        html: buildShippedEmail({
          id,
          tracking_number: ctx.trackingNumber ?? null,
          carrier: ctx.carrier ?? null,
          firstName: ctx.firstName,
        }),
      })
      await logEmailEvent(supabase, {
        type: "order_shipped",
        recipient: ctx.userEmail,
        subject,
        status: "sent",
        orderId: id,
      })
      results.push({ type: "order_shipped", sent: true })
    } catch (err: any) {
      const message = err?.message ?? String(err)
      console.error("[order-notifications] shipped email failed", err)
      await logEmailEvent(supabase, {
        type: "order_shipped",
        recipient: ctx.userEmail,
        subject,
        status: "failed",
        orderId: id,
        error: message,
      })
      results.push({ type: "order_shipped", sent: false, error: message })
    }
  }

  if (ctx.shipmentStatus === "delivered") {
    const subject = `Your Order Has Been Delivered – #${shortOrderId(id)} | Hygien Hub`
    try {
      await sendEmail(supabase, {
        to: ctx.userEmail,
        subject,
        html: buildDeliveredEmail({ id, firstName: ctx.firstName }),
      })
      await logEmailEvent(supabase, {
        type: "order_delivered",
        recipient: ctx.userEmail,
        subject,
        status: "sent",
        orderId: id,
      })
      results.push({ type: "order_delivered", sent: true })
    } catch (err: any) {
      const message = err?.message ?? String(err)
      console.error("[order-notifications] delivered email failed", err)
      await logEmailEvent(supabase, {
        type: "order_delivered",
        recipient: ctx.userEmail,
        subject,
        status: "failed",
        orderId: id,
        error: message,
      })
      results.push({ type: "order_delivered", sent: false, error: message })
    }
  }

  return results
}

/**
 * Order-status emails (processing). Shipped/delivered go via the shipment path.
 */
export async function notifyOrderStatusChange(
  supabase: SupabaseClient,
  ctx: OrderEmailContext,
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = []

  if (
    !shouldNotifyOrderStatusChange(ctx.orderStatus, ctx.previousOrderStatus) ||
    !ctx.userEmail ||
    !ctx.orderStatus
  ) {
    return results
  }

  const status = ctx.orderStatus as NotifiableOrderStatus

  // Shipped/delivered are handled via shipment path to avoid duplicate emails.
  if (status === "shipped" || status === "delivered") {
    return results
  }

  if (status === "processing") {
    const subject = `We're preparing your order – #${shortOrderId(ctx.orderId)} | Hygien Hub`
    try {
      await sendEmail(supabase, {
        to: ctx.userEmail,
        subject,
        html: buildProcessingEmail({
          id: ctx.orderId,
          firstName: ctx.firstName,
        }),
      })
      await logEmailEvent(supabase, {
        type: "order_processing",
        recipient: ctx.userEmail,
        subject,
        status: "sent",
        orderId: ctx.orderId,
      })
      results.push({ type: "order_processing", sent: true })
    } catch (err: any) {
      const message = err?.message ?? String(err)
      console.error("[order-notifications] processing email failed", err)
      await logEmailEvent(supabase, {
        type: "order_processing",
        recipient: ctx.userEmail,
        subject,
        status: "failed",
        orderId: ctx.orderId,
        error: message,
      })
      results.push({
        type: "order_processing",
        sent: false,
        error: message,
      })
    }
  }

  return results
}

/** Run all applicable customer notifications for a status update. */
export async function notifyOrderUpdate(
  supabase: SupabaseClient,
  ctx: OrderEmailContext,
): Promise<NotificationResult[]> {
  const shipment = await notifyShipmentStatusChange(supabase, ctx)
  const order = await notifyOrderStatusChange(supabase, ctx)
  return [...shipment, ...order]
}
