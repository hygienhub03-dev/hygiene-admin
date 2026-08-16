import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { requireAdminForApi } from "@/lib/admin-auth"
import {
  getLowStockThreshold,
  summarizeLowStock,
} from "@/lib/services/low-stock"

/**
 * GET /api/products/low-stock?threshold=10
 *
 * Returns products at or below the threshold (default 10, or LOW_STOCK_THRESHOLD env).
 * Includes both completely out-of-stock and low-but-not-zero items.
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdminForApi(req)
  if (authError) return authError

  try {
    const threshold = getLowStockThreshold(
      req.nextUrl.searchParams.get("threshold"),
    )

    const supabase = createServerClient(
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

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        stock,
        brand,
        category: categories(id, name, slug),
        images: product_images(id, url)
      `,
      )
      .lte("stock", threshold)
      .order("stock", { ascending: true })
      .limit(200)

    if (error) throw error

    const summary = summarizeLowStock(
      (data ?? []).map((row: any) => ({
        ...row,
        title: row.name,
      })),
      threshold,
    )

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (error: any) {
    console.error("[GET /api/products/low-stock]", error)
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    )
  }
}
