/**
 * Admin low-stock email digest — intended for Vercel Cron.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  sendEmail,
  buildLowStockDigestEmail,
} from "@hygienhub/order-emails"
import {
  getLowStockThreshold,
  summarizeLowStock,
  type LowStockSummary,
} from "@/lib/services/low-stock"

export function getAdminDigestRecipients(): string[] {
  const raw =
    process.env.ADMIN_DIGEST_EMAILS ??
    process.env.ADMIN_EMAIL ??
    process.env.LOW_STOCK_DIGEST_EMAILS ??
    ""
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"))
}

export async function fetchLowStockSummary(
  supabase: SupabaseClient,
  threshold?: number,
): Promise<LowStockSummary> {
  const t = threshold ?? getLowStockThreshold()
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      stock,
      brand,
      category: categories(id, name, slug),
      images: product_images(id, url)
    `,
    )
    .lte("stock", t)
    .order("stock", { ascending: true })
    .limit(200)

  if (error) throw error

  return summarizeLowStock(
    (data ?? []).map((row: any) => ({
      ...row,
      title: row.name,
    })),
    t,
  )
}

export interface DigestSendResult {
  sent: boolean
  recipients: string[]
  summary: LowStockSummary
  skipped?: boolean
  reason?: string
  error?: string
}

/**
 * Build + send the daily low-stock digest to configured admin emails.
 * Skips the send (but still returns summary) when there is nothing low
 * and SKIP_EMPTY_DIGEST is not "false".
 */
export async function sendLowStockDigest(
  supabase: SupabaseClient,
  options?: { threshold?: number; force?: boolean },
): Promise<DigestSendResult> {
  const recipients = getAdminDigestRecipients()
  const summary = await fetchLowStockSummary(supabase, options?.threshold)

  if (!recipients.length) {
    return {
      sent: false,
      recipients: [],
      summary,
      skipped: true,
      reason: "no_recipients",
    }
  }

  const skipEmpty = process.env.SKIP_EMPTY_DIGEST !== "false"
  if (!options?.force && skipEmpty && summary.total === 0) {
    return {
      sent: false,
      recipients,
      summary,
      skipped: true,
      reason: "empty",
    }
  }

  const subject =
    summary.total === 0
      ? `Inventory OK — no low-stock products | Hygien Hub`
      : `Low stock alert: ${summary.outOfStock} out · ${summary.low} low | Hygien Hub`

  const html = buildLowStockDigestEmail({
    threshold: summary.threshold,
    outOfStock: summary.outOfStock,
    low: summary.low,
    products: summary.products.map((p) => ({
      title: p.title,
      stock: p.stock,
      level: p.level,
      brand: p.brand,
      category: p.category,
    })),
    adminUrl: process.env.NEXT_PUBLIC_APP_ORIGIN,
  })

  try {
    await sendEmail(supabase, {
      to: recipients,
      subject,
      html,
      from: process.env.EMAIL_FROM ?? "Hygien Hub Ops <ops@hygienhub.co.za>",
    })

    try {
      await supabase.from("email_events").insert({
        type: "low_stock_digest",
        recipient: recipients.join(","),
        subject,
        status: "sent",
        metadata: {
          total: summary.total,
          out_of_stock: summary.outOfStock,
          low: summary.low,
          threshold: summary.threshold,
        },
      })
    } catch (err) {
      console.warn("[low-stock-digest] email_events insert skipped", err)
    }

    return { sent: true, recipients, summary }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    try {
      await supabase.from("email_events").insert({
        type: "low_stock_digest",
        recipient: recipients.join(","),
        subject,
        status: "failed",
        metadata: { error: message },
      })
    } catch {
      /* ignore */
    }
    return {
      sent: false,
      recipients,
      summary,
      error: message,
    }
  }
}
