import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createSupabaseAdminClient()

  const { data: campaigns, error } = await supabase
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaigns: campaigns || [] })
}

export async function POST(req: Request) {
  try {
    const { name, subject, body } = await req.json()

    if (!name || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // Get all newsletter subscribers
    const { data: subscribers } = await supabase
      .from('newsletter_subscribers')
      .select('email')
      .eq('subscribed', true)

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ error: 'No subscribers found' }, { status: 400 })
    }

    // Create campaign record
    const { data: campaign, error: insertError } = await supabase
      .from('email_campaigns')
      .insert({
        name,
        subject,
        body_html: body,
        status: 'sent',
        sent_count: subscribers.length,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Send emails via edge function (fire-and-forget for large batches)
    const { sendEmailAsService } = await import('@/lib/supabase/edge-functions')

    for (const subscriber of subscribers) {
      try {
        await sendEmailAsService({
          to: subscriber.email,
          subject,
          html: body,
        })
      } catch (e) {
        console.error(`Failed to send to ${subscriber.email}:`, e)
      }
    }

    return NextResponse.json({ campaign })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
