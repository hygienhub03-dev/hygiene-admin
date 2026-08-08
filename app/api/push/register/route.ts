import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdminForApi } from '@/lib/admin-auth'
import { createServerClient } from '@supabase/ssr'
import { extractBearerToken } from '@/lib/admin-auth'

/**
 * Register Expo push token for the authenticated admin.
 * Body: { token: string, platform?: string }
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const token = body.token as string | undefined
    const platform = (body.platform as string | undefined) ?? null

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, message: 'token required' },
        { status: 400 },
      )
    }

    // Resolve user id from bearer / cookies
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll()
          },
          setAll() {},
        },
      },
    )
    const bearer = extractBearerToken(req.headers.get('authorization'))
    const { data: authData } = bearer
      ? await supabaseUser.auth.getUser(bearer)
      : await supabaseUser.auth.getUser()

    const userId = authData.user?.id
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 },
      )
    }

    const admin = createSupabaseAdminClient()

    // Upsert by token (unique)
    const { error } = await admin.from('admin_push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    )

    if (error) {
      // Table may not exist yet — surface clear message
      console.error('push register', error)
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 },
    )
  }
}
