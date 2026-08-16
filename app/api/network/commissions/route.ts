import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdminForApi } from '@/lib/admin-auth'
import { sendEmail, buildCommissionEarnedEmail } from '@hygienhub/order-emails'
import { auditCommissionApproved } from '@/lib/services/audit'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const supabase = createSupabaseAdminClient()
    const status = req.nextUrl.searchParams.get('status') || undefined

    let q = supabase
      .from('commissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: unknown) {
    logger.error('Failed to fetch commissions', undefined, error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/network/commissions
 *
 * Actions:
 *   { ids: string[] }                          → approve pending commissions (default)
 *   { id: string, action: 'reverse', reason }  → reverse an available commission
 */
export async function POST(req: NextRequest) {
  const { error: authError, userId } = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const action = body.action as 'approve' | 'reverse' | undefined

    if (action === 'reverse') {
      return handleReverse(req, body, userId!)
    }
    return handleApprove(req, body, userId!)
  } catch (error: unknown) {
    logger.error('Commission action failed', undefined, error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    )
  }
}

async function handleApprove(
  req: NextRequest,
  body: { ids?: string[]; id?: string },
  adminId: string,
) {
  const ids: string[] = body.ids ?? (body.id ? [body.id] : [])
  if (!ids.length) {
    return NextResponse.json(
      { success: false, message: 'ids required' },
      { status: 400 },
    )
  }

  const supabase = createSupabaseAdminClient()
  let approved = 0

  for (const commissionId of ids) {
    try {
      const { data, error } = await supabase.rpc('approve_commission', {
        p_commission_id: commissionId,
        p_admin_id: adminId,
      })

      if (error) {
        logger.error('Failed to approve commission', { commissionId, error: error.message })
        continue
      }

      if (data === true) {
        approved++

        const { data: commission } = await supabase
          .from('commissions')
          .select('earner_id, amount_zar, level, source_order_id')
          .eq('id', commissionId)
          .maybeSingle()

        if (commission) {
          await auditCommissionApproved(supabase, adminId, commissionId, Number(commission.amount_zar))
          await sendReversalOrApprovalEmail(supabase, commission, 'approved')
        }
      }
    } catch (e) {
      logger.error('Error approving commission', { commissionId }, e)
    }
  }

  return NextResponse.json({ success: true, approved })
}

async function handleReverse(
  req: NextRequest,
  body: { id?: string; ids?: string[]; reason?: string },
  adminId: string,
) {
  const ids: string[] = body.ids ?? (body.id ? [body.id] : [])
  if (!ids.length) {
    return NextResponse.json(
      { success: false, message: 'id or ids required' },
      { status: 400 },
    )
  }

  const reason = body.reason ?? 'Admin reversal'
  const supabase = createSupabaseAdminClient()
  let reversed = 0

  for (const commissionId of ids) {
    try {
      const { error } = await supabase.rpc('reverse_commission', {
        p_commission_id: commissionId,
        p_reason: reason,
        p_actor_id: adminId,
      })

      if (error) {
        logger.error('Failed to reverse commission', { commissionId, error: error.message })
        continue
      }

      reversed++

      const { data: commission } = await supabase
        .from('commissions')
        .select('earner_id, amount_zar, level, source_order_id')
        .eq('id', commissionId)
        .maybeSingle()

      if (commission) {
        await sendReversalOrApprovalEmail(supabase, commission, 'reversed')
      }
    } catch (e) {
      logger.error('Error reversing commission', { commissionId }, e)
    }
  }

  return NextResponse.json({ success: true, reversed })
}

async function sendReversalOrApprovalEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  commission: { earner_id: string; amount_zar: number | string; level: number | null; source_order_id: string | null },
  status: 'approved' | 'reversed',
) {
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(commission.earner_id)
    const to = authUser?.user?.email
    if (!to) return

    const subject =
      status === 'approved'
        ? `Commission approved – R${Number(commission.amount_zar).toFixed(2)}`
        : `Commission reversed – R${Number(commission.amount_zar).toFixed(2)}`

    await sendEmail(supabase, {
      to,
      subject,
      html: buildCommissionEarnedEmail({
        amountZar: Number(commission.amount_zar),
        level: Number(commission.level ?? 1),
        status,
        orderRef: commission.source_order_id
          ? String(commission.source_order_id).slice(0, 8).toUpperCase()
          : null,
      }),
    })
  } catch (mailErr) {
    logger.error(`Commission ${status} email failed`, { commissionId: commission.earner_id }, mailErr)
  }
}
