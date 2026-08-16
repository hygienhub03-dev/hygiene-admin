import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  commitOrderInventory,
  hasInventoryCommitted,
  type OrderLineItem,
} from "@/lib/services/inventory"

/**
 * POST /api/orders/inventory/reserve
 *
 * Called by the storefront right after an order is created so stock is
 * decremented immediately (not only when an admin marks Processing/Shipped).
 *
 * Auth: Authorization: Bearer <STOREFRONT_INVENTORY_SECRET>
 *   or  x-storefront-secret: <STOREFRONT_INVENTORY_SECRET>
 *
 * Body:
 *   { orderId: string, items?: OrderLineItem[] }
 * If items is omitted, line items are loaded from order_items for that order.
 */
function authorizeStorefront(req: NextRequest): NextResponse | null {
  const secret = process.env.STOREFRONT_INVENTORY_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, message: "STOREFRONT_INVENTORY_SECRET is not configured" },
        { status: 500 },
      )
    }
    // Dev: allow without secret for local integration tests.
    return null
  }

  const auth = req.headers.get("authorization")
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
  const headerSecret = req.headers.get("x-storefront-secret")
  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json(
      { success: false, message: "Unauthorised" },
      { status: 401 },
    )
  }
  return null
}

export async function POST(req: NextRequest) {
  const authError = authorizeStorefront(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.orderId ?? body.order_id
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { success: false, message: "orderId is required" },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()

    if (await hasInventoryCommitted(supabase, orderId)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "already_committed",
        inventory: { adjusted: 0, lowStock: [], becameLow: [] },
      })
    }

    let items: OrderLineItem[] = Array.isArray(body.items) ? body.items : []

    if (!items.length) {
      const { data: rows, error } = await supabase
        .from("order_items")
        .select("product_id, quantity, product_name")
        .eq("order_id", orderId)

      if (error) throw error
      items = (rows ?? []).map((r: any) => ({
        product_id: r.product_id,
        quantity: Number(r.quantity ?? 0),
        product_name: r.product_name,
      }))
    }

    // Normalize alternate field names from storefront payloads.
    items = items.map((item: any) => ({
      product_id: item.product_id ?? item.productId,
      quantity: Number(item.quantity ?? 0),
      product_name: item.product_name ?? item.productName ?? item.title,
    }))

    const inventory = await commitOrderInventory(supabase, orderId, items, {
      reason: "order_create",
      skipCommittedCheck: true,
    })

    return NextResponse.json({
      success: true,
      skipped: inventory.skipped,
      reason: inventory.reason,
      inventory: {
        adjusted: inventory.adjusted.length,
        lowStock: inventory.lowStock,
        becameLow: inventory.adjusted
          .filter((a) => a.becameLow)
          .map((a) => ({
            id: a.productId,
            title: a.title,
            stock: a.newStock,
            level: a.level,
          })),
        details: inventory.adjusted,
      },
    })
  } catch (error: any) {
    console.error("[POST /api/orders/inventory/reserve]", error)
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    )
  }
}
