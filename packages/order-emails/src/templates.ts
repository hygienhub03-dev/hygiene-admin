/**
 * HTML email templates for Hygien Hub order lifecycle emails.
 * Shared between the storefront and the admin dashboard.
 */

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase()
}

function layout(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f6f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e4de;">
          <tr>
            <td style="padding:28px 32px 16px;border-bottom:1px solid #f0ebe4;">
              <p style="margin:0;font-size:18px;font-weight:600;letter-spacing:0.02em;">Hygien Hub</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b6560;">${title}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0ebe4;">
              <p style="margin:0;font-size:12px;color:#9a948c;line-height:1.5;">
                Questions? Reply to this email or visit hygienhub.co.za<br />
                © ${new Date().getFullYear()} Hygien Hub
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface ProcessingEmailParams {
  id: string
  /** Optional customer first name for a warmer greeting */
  firstName?: string | null
}

export function buildProcessingEmail(params: ProcessingEmailParams): string {
  const ref = shortId(params.id)
  const greeting = params.firstName
    ? `Hi ${params.firstName},`
    : "Hi there,"

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Good news — we've started preparing your order <strong>#${ref}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Our team is packing your items carefully. You'll get another email with tracking
      details as soon as it ships.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6b6560;">
      Thanks for shopping with Hygien Hub.
    </p>
  `
  return layout(`We're preparing your order #${ref}`, body)
}

export interface ShippedEmailParams {
  id: string
  tracking_number?: string | null
  carrier?: string | null
  firstName?: string | null
}

export function buildShippedEmail(params: ShippedEmailParams): string {
  const ref = shortId(params.id)
  const greeting = params.firstName
    ? `Hi ${params.firstName},`
    : "Hi there,"

  const trackingBlock =
    params.tracking_number || params.carrier
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f9f7f4;border-radius:8px;border:1px solid #ebe6df;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#9a948c;">Tracking</p>
          ${
            params.tracking_number
              ? `<p style="margin:0 0 4px;font-size:15px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${params.tracking_number}</p>`
              : ""
          }
          ${
            params.carrier
              ? `<p style="margin:0;font-size:14px;color:#6b6560;">Carrier: ${params.carrier}</p>`
              : ""
          }
        </td>
      </tr>
    </table>`
      : ""

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your order <strong>#${ref}</strong> is on its way.
    </p>
    ${trackingBlock}
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6b6560;">
      We'll let you know when it's delivered.
    </p>
  `
  return layout(`Your order has shipped #${ref}`, body)
}

export interface DeliveredEmailParams {
  id: string
  firstName?: string | null
}

export function buildDeliveredEmail(params: DeliveredEmailParams): string {
  const ref = shortId(params.id)
  const greeting = params.firstName
    ? `Hi ${params.firstName},`
    : "Hi there,"

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your order <strong>#${ref}</strong> has been delivered. We hope you love it.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6b6560;">
      If anything isn't right, reply to this email and we'll sort it out.
    </p>
  `
  return layout(`Your order has been delivered #${ref}`, body)
}

export interface LowStockDigestParams {
  threshold: number
  outOfStock: number
  low: number
  products: Array<{
    title: string
    stock: number
    level: string
    brand?: string
    category?: string
  }>
  adminUrl?: string
}

export function buildLowStockDigestEmail(params: LowStockDigestParams): string {
  const rows = params.products
    .slice(0, 40)
    .map((p) => {
      const status =
        p.level === "out_of_stock"
          ? `<span style="color:#b91c1c;font-weight:600;">Out of stock</span>`
          : `<span style="color:#b45309;font-weight:600;">${p.stock} left</span>`
      const meta = [p.brand, p.category].filter(Boolean).join(" · ")
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0ebe4;font-size:14px;">
            <strong>${escapeHtml(p.title)}</strong>
            ${meta ? `<br /><span style="color:#9a948c;font-size:12px;">${escapeHtml(meta)}</span>` : ""}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0ebe4;font-size:14px;text-align:right;white-space:nowrap;">
            ${status}
          </td>
        </tr>`
    })
    .join("")

  const more =
    params.products.length > 40
      ? `<p style="margin:12px 0 0;font-size:13px;color:#9a948c;">…and ${params.products.length - 40} more</p>`
      : ""

  const link = params.adminUrl
    ? `<p style="margin:20px 0 0;"><a href="${params.adminUrl}/products" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">Open products</a></p>`
    : ""

  const body = `
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
      Daily inventory digest — <strong>${params.outOfStock}</strong> out of stock,
      <strong>${params.low}</strong> low (≤${params.threshold}).
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #ebe6df;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9f7f4;">
        <th align="left" style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#9a948c;">Product</th>
        <th align="right" style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#9a948c;">Stock</th>
      </tr>
      ${rows || `<tr><td colspan="2" style="padding:16px;font-size:14px;color:#6b6560;">No low-stock products right now.</td></tr>`}
    </table>
    ${more}
    ${link}
  `
  return layout("Low-stock inventory digest", body)
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}


// ---------------------------------------------------------------------------
// Network / backoffice partner emails
// ---------------------------------------------------------------------------

const BACKOFFICE_URL =
  process.env.NEXT_PUBLIC_BACKOFFICE_URL?.replace(/\/$/, "") ||
  "https://backoffice.hygienhub.co.za"

export interface PartnerWelcomeParams {
  firstName?: string | null
  referralCode: string
  sponsorCode?: string | null
}

export function buildPartnerWelcomeEmail(params: PartnerWelcomeParams): string {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi there,"
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Welcome to the <strong>Hygien Hub</strong> partner network. Your backoffice is ready.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f9f7f4;border-radius:8px;border:1px solid #ebe6df;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9a948c;text-transform:uppercase;letter-spacing:0.05em;">Your referral code</p>
          <p style="margin:0;font-size:20px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${params.referralCode}</p>
          ${
            params.sponsorCode
              ? `<p style="margin:12px 0 0;font-size:13px;color:#6b6560;">Sponsored by <strong>${params.sponsorCode}</strong></p>`
              : ""
          }
        </td>
      </tr>
    </table>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b6560;">
      Share your link so customers and new partners are attributed to you. Track team, commissions, and stock in the backoffice.
    </p>
    <p style="margin:0;">
      <a href="${BACKOFFICE_URL}/dashboard" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open backoffice</a>
    </p>
  `
  return layout("Welcome to the partner network", body)
}

export interface TeamJoinParams {
  firstName?: string | null
  newMemberCode: string
  level?: number
}

export function buildTeamJoinEmail(params: TeamJoinParams): string {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi there,"
  const level = params.level ?? 1
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Great news — <strong>${params.newMemberCode}</strong> just joined your team
      ${level === 1 ? "(direct partner)" : `(level ${level})`}.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b6560;">
      You can see them under <strong>My team</strong> in the backoffice.
    </p>
    <p style="margin:0;">
      <a href="${BACKOFFICE_URL}/team" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View team</a>
    </p>
  `
  return layout("New partner on your team", body)
}

export interface CommissionEarnedParams {
  firstName?: string | null
  amountZar: number
  level: number
  status: "pending" | "approved"
  orderRef?: string | null
}

export function buildCommissionEarnedEmail(params: CommissionEarnedParams): string {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi there,"
  const amount = `R${Number(params.amountZar).toFixed(2)}`
  const pendingNote =
    params.status === "pending"
      ? "This commission is <strong>pending</strong> and will be added to your wallet after company approval."
      : "This commission has been <strong>approved</strong> and credited to your wallet."
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      You earned a level <strong>${params.level}</strong> commission of
      <strong style="font-size:18px;">${amount}</strong>.
    </p>
    ${
      params.orderRef
        ? `<p style="margin:0 0 16px;font-size:14px;color:#6b6560;">Order #${params.orderRef}</p>`
        : ""
    }
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b6560;">
      ${pendingNote}
    </p>
    <p style="margin:0;">
      <a href="${BACKOFFICE_URL}/commissions" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View commissions</a>
    </p>
  `
  return layout(
    params.status === "pending" ? "Commission earned (pending)" : "Commission approved",
    body,
  )
}

export interface PayoutUpdateParams {
  firstName?: string | null
  amountZar: number
  status: "paid" | "rejected"
  note?: string | null
}

export function buildPayoutUpdateEmail(params: PayoutUpdateParams): string {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi there,"
  const amount = `R${Number(params.amountZar).toFixed(2)}`
  const isPaid = params.status === "paid"
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your payout request of <strong>${amount}</strong> has been
      <strong>${isPaid ? "paid" : "rejected"}</strong>.
    </p>
    ${
      params.note
        ? `<p style="margin:0 0 16px;font-size:14px;color:#6b6560;">${params.note}</p>`
        : ""
    }
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b6560;">
      ${
        isPaid
          ? "Funds should reflect according to your bank's processing times."
          : "Your wallet balance was not debited. You can request again from the backoffice."
      }
    </p>
    <p style="margin:0;">
      <a href="${BACKOFFICE_URL}/wallet" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open wallet</a>
    </p>
  `
  return layout(isPaid ? "Payout paid" : "Payout update", body)
}

export interface RankChangeParams {
  firstName?: string | null
  rank: string
  previousRank?: string | null
}

export function buildRankChangeEmail(params: RankChangeParams): string {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi there,"
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your partner rank is now <strong style="text-transform:capitalize;">${params.rank}</strong>
      ${
        params.previousRank
          ? ` (was <span style="text-transform:capitalize;">${params.previousRank}</span>)`
          : ""
      }.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b6560;">
      Keep sharing your referral link and growing product volume.
    </p>
    <p style="margin:0;">
      <a href="${BACKOFFICE_URL}/dashboard" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open dashboard</a>
    </p>
  `
  return layout("Rank update", body)
}
