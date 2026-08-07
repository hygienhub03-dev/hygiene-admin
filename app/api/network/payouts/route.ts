import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdminForApi } from '@/lib/admin-auth'
import { sendEmail, buildPayoutUpdateEmail } from '@hygienhub/order-emails'

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req)
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
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}

/** Mark payout paid (debit wallet) or rejected */
export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { id, action, note } = body as {
      id: string
      action: 'paid' | 'rejected'
      note?: string
    }

    if (!id || !['paid', 'rejected'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'id and action (paid|rejected) required' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()
    const { data: payout, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !payout) {
      return NextResponse.json(
        { success: false, message: 'Payout not found' },
        { status: 404 },
      )
    }

    if (!['requested', 'processing'].includes(payout.status)) {
      return NextResponse.json(
        { success: false, message: `Cannot process payout in status ${payout.status}` },
        { status: 400 },
      )
    }

    if (action === 'rejected') {
      await supabase
        .from('payouts')
        .update({
          status: 'rejected',
          note: note ?? payout.note,
          processed_at: new Date().toISOString(),
        })
        .eq('id', id)
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(payout.distributor_id)
        const to = authUser?.user?.email
        if (to) {
          await sendEmail(supabase, {
            to,
            subject: `Payout update – R${Number(payout.amount_zar).toFixed(2)}`,
            html: buildPayoutUpdateEmail({
              amountZar: Number(payout.amount_zar),
              status: 'rejected',
              note: note ?? payout.note,
            }),
          })
        }
      } catch (e) {
        console.error('Payout reject email failed', e)
      }
      return NextResponse.json({ success: true })
    }

    const amount = Number(payout.amount_zar)
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance_zar')
      .eq('distributor_id', payout.distributor_id)
      .single()

    const balance = Number(wallet?.balance_zar ?? 0)
    if (balance < amount) {
      return NextResponse.json(
        { success: false, message: 'Insufficient wallet balance' },
        { status: 400 },
      )
    }

    await supabase
      .from('wallets')
      .update({
        balance_zar: balance - amount,
        updated_at: new Date().toISOString(),
      })
      .eq('distributor_id', payout.distributor_id)

    await supabase
      .from('payouts')
      .update({
        status: 'paid',
        note: note ?? payout.note,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)

    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(payout.distributor_id)
      const to = authUser?.user?.email
      if (to) {
        await sendEmail(supabase, {
          to,
          subject: `Payout paid – R${amount.toFixed(2)}`,
          html: buildPayoutUpdateEmail({
            amountZar: amount,
            status: 'paid',
            note: note ?? payout.note,
          }),
        })
      }
    } catch (e) {
      console.error('Payout paid email failed', e)
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}
