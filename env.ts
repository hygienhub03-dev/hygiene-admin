import { z } from 'zod'

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  ADMIN_TRUSTED_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_APP_ORIGIN: z.string().url().optional(),
  /** Comma-separated admin emails for the daily low-stock digest */
  ADMIN_DIGEST_EMAILS: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  /** Shared secret for Vercel Cron → /api/cron/low-stock-digest */
  CRON_SECRET: z.string().optional(),
  /** Shared secret for storefront → /api/orders/inventory/reserve */
  STOREFRONT_INVENTORY_SECRET: z.string().optional(),
  /** Resend API key for transactional email (order + digest) */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  LOW_STOCK_THRESHOLD: z.string().optional(),
  /** Comma-separated HTTPS endpoints notified on order status changes */
  ORDER_WEBHOOK_URLS: z.string().optional(),
  /** HMAC secret for X-Hygienhub-Signature header on outgoing webhooks */
  ORDER_WEBHOOK_SECRET: z.string().optional(),
})

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_ORIGIN: z.string().url().optional(),
})

function validateEnv() {
  const isServer = typeof window === 'undefined'
  if (isServer) {
    return serverSchema.parse(process.env)
  }
  return clientSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
  })
}

export const env = validateEnv()
