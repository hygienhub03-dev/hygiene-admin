/**
 * Shared email sender used by admin + storefront.
 *
 * Prefer Resend when RESEND_API_KEY is set. Always accepts a Supabase client
 * so callers can log to email_events without a second dependency.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SendEmailPayload {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export interface SendEmailResult {
  id?: string
  provider: "resend" | "log"
}

const DEFAULT_FROM =
  process.env.EMAIL_FROM ?? "Hygien Hub <orders@hygienhub.co.za>"

/**
 * Send a transactional email.
 * - With RESEND_API_KEY: posts to Resend's API.
 * - Without: logs to console (dev-safe) and still resolves so local flows work.
 */
export async function sendEmail(
  _supabase: SupabaseClient,
  payload: SendEmailPayload,
): Promise<SendEmailResult> {
  const to = Array.isArray(payload.to) ? payload.to : [payload.to]
  const from = payload.from ?? DEFAULT_FROM
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.info("[order-emails] RESEND_API_KEY not set — logging email only", {
      to,
      subject: payload.subject,
      from,
    })
    return { provider: "log" }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: payload.subject,
      html: payload.html,
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Resend error ${res.status}: ${text || res.statusText}`)
  }

  const data = (await res.json()) as { id?: string }
  return { id: data.id, provider: "resend" }
}
