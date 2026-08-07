/**
 * Inventory helpers for order create (storefront) and fulfilment (admin).
 * Decrements product stock once per order and returns any products that
 * crossed into low-stock.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  classifyStock,
  getLowStockThreshold,
  type LowStockProduct,
  type StockLevel,
} from "@/lib/services/low-stock"

/** Statuses that mean we have committed inventory for this order (admin path). */
export const FULFILMENT_STATUSES = new Set(["processing", "shipped", "delivered"])

export type InventoryReason = "order_create" | "order_fulfilment"

export interface OrderLineItem {
  product_id: string
  quantity: number
  product_name?: string | null
}

export interface StockAdjustment {
  productId: string
  title: string
  previousStock: number
  newStock: number
  quantity: number
  level: StockLevel
  becameLow: boolean
}

export interface InventoryAdjustResult {
  adjusted: StockAdjustment[]
  lowStock: LowStockProduct[]
  skipped: boolean
  reason?: string
}

/**
 * True when the order is moving into a fulfilment status for the first time.
 * Avoids double-decrement if admin toggles processing ↔ shipped ↔ delivered.
 * Callers should also rely on hasInventoryCommitted() for storefront-first flows.
 */
export function shouldCommitInventory(
  newOrderStatus: string | undefined,
  previousOrderStatus: string | null | undefined,
): boolean {
  if (!newOrderStatus || !FULFILMENT_STATUSES.has(newOrderStatus)) return false
  if (previousOrderStatus && FULFILMENT_STATUSES.has(previousOrderStatus)) {
    return false
  }
  return true
}

/**
 * Returns true if inventory_movements already has a row for this order
 * (storefront or a prior admin commit). Used to prevent double-decrement.
 */
export async function hasInventoryCommitted(
  supabase: SupabaseClient,
  orderId: string,
): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)

    if (error) {
      console.warn("[inventory] hasInventoryCommitted check failed", error)
      return false
    }
    return (count ?? 0) > 0
  } catch (err) {
    console.warn("[inventory] hasInventoryCommitted unexpected", err)
    return false
  }
}

/**
 * Decrement stock for each line item and record inventory_movements.
 * Safe to call only when inventory has not already been committed for the order.
 * Failures on individual products are logged; others still proceed.
 */
export async function commitOrderInventory(
  supabase: SupabaseClient,
  orderId: string,
  items: OrderLineItem[],
  options?: {
    threshold?: number
    reason?: InventoryReason
    /** Skip the already-committed check (caller already verified). */
    skipCommittedCheck?: boolean
  },
): Promise<InventoryAdjustResult> {
  // Back-compat: third arg used to be a plain number threshold.
  let threshold = getLowStockThreshold()
  let reason: InventoryReason = "order_fulfilment"
  let skipCommittedCheck = false

  if (typeof options === "number") {
    threshold = options as unknown as number
  } else if (options) {
    if (options.threshold !== undefined) threshold = options.threshold
    if (options.reason) reason = options.reason
    if (options.skipCommittedCheck) skipCommittedCheck = true
  }

  if (!items.length) {
    return { adjusted: [], lowStock: [], skipped: true, reason: "no_items" }
  }

  if (!skipCommittedCheck) {
    const already = await hasInventoryCommitted(supabase, orderId)
    if (already) {
      return {
        adjusted: [],
        lowStock: [],
        skipped: true,
        reason: "already_committed",
      }
    }
  }

  const adjusted: StockAdjustment[] = []
  const lowStock: LowStockProduct[] = []

  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity <= 0) continue

    try {
      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("id, name, stock")
        .eq("id", item.product_id)
        .single()

      if (fetchError || !product) {
        console.error(
          `[inventory] product ${item.product_id} not found for order ${orderId}`,
          fetchError,
        )
        continue
      }

      const previousStock = Number(product.stock ?? 0)
      const newStock = Math.max(0, previousStock - item.quantity)
      const previousLevel = classifyStock(previousStock, threshold)
      const newLevel = classifyStock(newStock, threshold)
      const becameLow =
        previousLevel === "ok" && (newLevel === "low" || newLevel === "out_of_stock")

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", item.product_id)

      if (updateError) {
        console.error(
          `[inventory] failed to update stock for ${item.product_id}`,
          updateError,
        )
        continue
      }

      try {
        await supabase.from("inventory_movements").insert({
          product_id: item.product_id,
          order_id: orderId,
          quantity: -item.quantity,
          previous_stock: previousStock,
          new_stock: newStock,
          reason,
        })
      } catch (err) {
        console.warn("[inventory] inventory_movements insert skipped", err)
      }

      const title = String(product.name ?? item.product_name ?? "Product")
      adjusted.push({
        productId: item.product_id,
        title,
        previousStock,
        newStock,
        quantity: item.quantity,
        level: newLevel,
        becameLow,
      })

      if (newLevel === "low" || newLevel === "out_of_stock") {
        lowStock.push({
          id: item.product_id,
          title,
          stock: newStock,
          level: newLevel,
        })
      }
    } catch (err) {
      console.error(`[inventory] unexpected error for ${item.product_id}`, err)
    }
  }

  return { adjusted, lowStock, skipped: false }
}

/**
 * After a manual stock edit, detect whether the product just crossed
 * into low / out-of-stock territory.
 */
export function detectLowStockTransition(
  previousStock: number,
  newStock: number,
  product: { id: string; title?: string; name?: string; brand?: string; category?: string },
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): LowStockProduct | null {
  const previousLevel = classifyStock(previousStock, threshold)
  const newLevel = classifyStock(newStock, threshold)

  if (newLevel === "ok") return null
  if (previousLevel === "ok" || newStock < previousStock) {
    return {
      id: product.id,
      title: String(product.title ?? product.name ?? "Product"),
      stock: newStock,
      level: newLevel,
      brand: product.brand,
      category: product.category,
    }
  }
  return null
}
