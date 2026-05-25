import { z } from 'zod'

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  ADMIN_TRUSTED_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_APP_ORIGIN: z.string().url().optional(),
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
