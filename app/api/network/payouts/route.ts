import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdminForApi } from '@/lib/admin-auth'
import { sendEmail, buildPayoutUpdateEmail } from '@hygienhub/order-emails'
import { auditPayoutProcessed } from '@/lib/services/audit'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const supabase = createSupabaseAdminClient()
    const status = req.nextUrl.searchParams.get('status') || undefined

    let q = supabase
      .from('payouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: unknown) {
    logger.error('Failed to fetch payouts', undefined, error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    )
  }
}

/** Process payout via the atomic process_payout RPC */
export async function POST(req: NextRequest) {
  const { error: authError, userId } = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { id, action, note } = body as {
      id: string
      action: 'paid' | 'rejected' | 'approved' | 'processing' | 'failed' | 'cancelled'
      note?: string
    }

    if (!id || !['paid', 'rejected', 'approved', 'processing', 'failed', 'cancelled'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'id and valid action required' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()

    const { data: payout } = await supabase
      .from('payouts')
      .select('distributor_id, amount_zar, status')
      .eq('id', id)
      .maybeSingle()

    if (!payout) {
      return NextResponse.json(
        { success: false, message: 'Payout not found' },
        { status: 404 },
      )
    }

    const { data, error } = await supabase.rpc('process_payout', {
      p_payout_id: id,
      p_action: action,
      p_admin_id: userId!,
      p_note: note ?? null,
    })

    if (error) throw error
    if (data !== true) {
      return NextResponse.json(
        { success: false, message: `process_payout returned false for action ${action}` },
        { status: 400 },
      )
    }

    await auditPayoutProcessed(supabase, userId!, id, action, Number(payout.amount_zar))

    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(payout.distributor_id)
      const to = authUser?.user?.email
      if (to) {
        const emailStatus = action === 'rejected' ? 'rejected' : action === 'paid' ? 'paid' : action
        await sendEmail(supabase, {
          to,
          subject: `Payout ${emailStatus} – R${Number(payout.amount_zar).toFixed(2)}`,
          html: buildPayoutUpdateEmail({
            amountZar: Number(payout.amount_zar),
            status: emailStatus as 'paid' | 'rejected',
            note: note,
          }),
        })
      }
    } catch (e) {
      logger.error('Payout email failed', undefined, e)
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    logger.error('Payout action failed', undefined, error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    )
  }
}
