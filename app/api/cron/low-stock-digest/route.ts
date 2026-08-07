import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { sendLowStockDigest } from "@/lib/services/low-stock-digest"
import { getLowStockThreshold } from "@/lib/services/low-stock"

/**
 * GET/POST /api/cron/low-stock-digest
 *
 * Vercel Cron (or any scheduler) should call this with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Optional query: ?threshold=10&force=1
 */
function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Allow in development without secret so local testing is easy.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, message: "CRON_SECRET is not configured" },
        { status: 500 },
      )
    }
    return null
  }

  const auth = req.headers.get("authorization")
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
  const headerSecret = req.headers.get("x-cron-secret")
  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json(
      { success: false, message: "Unauthorised" },
      { status: 401 },
    )
  }
  return null
}

async function handle(req: NextRequest) {
  const authError = authorizeCron(req)
  if (authError) return authError

  try {
    const url = req.nextUrl
    const thresholdParam = url.searchParams.get("threshold")
    const force = url.searchParams.get("force") === "1"
    const threshold = thresholdParam
      ? getLowStockThreshold(thresholdParam)
      : undefined

    const supabase = createSupabaseAdminClient()
    const result = await sendLowStockDigest(supabase, { threshold, force })

    return NextResponse.json({
      success: !result.error,
      ...result,
    })
  } catch (error: any) {
    console.error("[cron/low-stock-digest]", error)
    return NextResponse.json(
      { success: false, message: error?.message ?? "Digest failed" },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
