import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdminForApi } from '@/lib/admin-auth'
import { sendEmail, buildCommissionEarnedEmail } from '@hygienhub/order-emails'

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req)
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
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}

/** Approve pending commissions and credit wallets */
export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const ids: string[] = body.ids ?? (body.id ? [body.id] : [])
    if (!ids.length) {
      return NextResponse.json(
        { success: false, message: 'ids required' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()
    const { data: rows, error } = await supabase
      .from('commissions')
      .select('id, earner_id, amount_zar, status, level, source_order_id')
      .in('id', ids)
      .eq('status', 'pending')

    if (error) throw error
    if (!rows?.length) {
      return NextResponse.json({ success: true, approved: 0 })
    }

    let approved = 0
    for (const row of rows) {
      const amount = Number(row.amount_zar)
      const { error: updErr } = await supabase
        .from('commissions')
        .update({ status: 'approved' })
        .eq('id', row.id)
        .eq('status', 'pending')
      if (updErr) throw updErr

      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance_zar, lifetime_earned_zar')
        .eq('distributor_id', row.earner_id)
        .maybeSingle()

      if (wallet) {
        await supabase
          .from('wallets')
          .update({
            balance_zar: Number(wallet.balance_zar) + amount,
            lifetime_earned_zar: Number(wallet.lifetime_earned_zar) + amount,
            updated_at: new Date().toISOString(),
          })
          .eq('distributor_id', row.earner_id)
      } else {
        await supabase.from('wallets').insert({
          distributor_id: row.earner_id,
          balance_zar: amount,
          lifetime_earned_zar: amount,
        })
      }

      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(row.earner_id)
        const to = authUser?.user?.email
        if (to) {
          const amount = Number(row.amount_zar)
          await sendEmail(supabase, {
            to,
            subject: `Commission approved – R${amount.toFixed(2)}`,
            html: buildCommissionEarnedEmail({
              amountZar: amount,
              level: Number(row.level ?? 1),
              status: 'approved',
              orderRef: row.source_order_id
                ? String(row.source_order_id).slice(0, 8).toUpperCase()
                : null,
            }),
          })
        }
      } catch (mailErr) {
        console.error('Commission approve email failed', mailErr)
      }

      approved++
    }

    return NextResponse.json({ success: true, approved })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}
