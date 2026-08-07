import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdminForApi } from '@/lib/admin-auth'
import { sendEmail, buildRankChangeEmail } from '@hygienhub/order-emails'

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('distributors')
      .select('*, wallets(balance_zar, lifetime_earned_zar)')
      .order('enrolled_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}

/** Update rank and/or status */
export async function PATCH(req: NextRequest) {
  const authError = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { id, rank, status } = body as {
      id: string
      rank?: string
      status?: string
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'id required' },
        { status: 400 },
      )
    }

    const allowedRanks = ['member', 'bronze', 'silver', 'gold', 'platinum']
    const allowedStatus = ['pending', 'active', 'suspended']
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (rank !== undefined) {
      if (!allowedRanks.includes(rank)) {
        return NextResponse.json(
          { success: false, message: 'Invalid rank' },
          { status: 400 },
        )
      }
      update.rank = rank
    }
    if (status !== undefined) {
      if (!allowedStatus.includes(status)) {
        return NextResponse.json(
          { success: false, message: 'Invalid status' },
          { status: 400 },
        )
      }
      update.status = status
    }

    const supabase = createSupabaseAdminClient()
    const { data: previous } = await supabase
      .from('distributors')
      .select('rank')
      .eq('id', id)
      .maybeSingle()

    const { data, error } = await supabase
      .from('distributors')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (rank && rank !== previous?.rank) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(id)
        const to = authUser?.user?.email
        if (to) {
          await sendEmail(supabase, {
            to,
            subject: `Your partner rank is now ${rank}`,
            html: buildRankChangeEmail({
              rank,
              previousRank: previous?.rank ?? null,
            }),
          })
        }
      } catch (e) {
        console.error('Rank change email failed', e)
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}
