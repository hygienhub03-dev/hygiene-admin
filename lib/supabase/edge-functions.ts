import { createSupabaseAdminClient } from './admin'

interface SendEmailParams {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
}

export async function sendEmailAsService(params: SendEmailParams) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.functions.invoke('send-email', {
    body: params,
  })

  if (error) {
    console.error('Edge function error:', error)
    return { success: false, error: error.message }
  }

  return { success: true, data }
}
