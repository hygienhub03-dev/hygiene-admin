/**
 * Low-stock detection helpers.
 * Pure functions stay unit-testable without Supabase.
 */

export const DEFAULT_LOW_STOCK_THRESHOLD = 10

export type StockLevel = "out_of_stock" | "low" | "ok"

export interface LowStockProduct {
  id: string
  title: string
  stock: number
  level: StockLevel
  category?: string
  image?: string
  brand?: string
}

export function getLowStockThreshold(
  explicit?: number | string | null,
): number {
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    const n = Number(explicit)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  const fromEnv = process.env.LOW_STOCK_THRESHOLD
  if (fromEnv) {
    const n = Number(fromEnv)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return DEFAULT_LOW_STOCK_THRESHOLD
}

export function classifyStock(
  stock: number,
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): StockLevel {
  if (stock <= 0) return "out_of_stock"
  if (stock <= threshold) return "low"
  return "ok"
}

/** True when stock is at or below threshold (includes zero). */
export function isLowStock(
  stock: number,
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): boolean {
  return stock <= threshold
}

/**
 * Map a raw products row into a low-stock alert item.
 * Accepts either `stock` or `totalStock` field names.
 */
export function toLowStockProduct(
  doc: Record<string, any>,
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): LowStockProduct | null {
  const stock = Number(doc.stock ?? doc.totalStock ?? 0)
  if (!isLowStock(stock, threshold)) return null

  const category =
    typeof doc.category === "object"
      ? (doc.category?.name ?? "")
      : (doc.category ?? "")

  let image = doc.image ?? ""
  if (!image && Array.isArray(doc.product_images) && doc.product_images[0]) {
    image = doc.product_images[0]?.url ?? ""
  }
  if (!image && Array.isArray(doc.images) && doc.images[0]) {
    image = doc.images[0]?.url ?? ""
  }
  if (!image && Array.isArray(doc.image_urls) && doc.image_urls[0]) {
    image = doc.image_urls[0] ?? ""
  }

  return {
    id: String(doc.id ?? ""),
    title: String(doc.title ?? doc.name ?? "Untitled"),
    stock,
    level: classifyStock(stock, threshold),
    category: category || undefined,
    image: image || undefined,
    brand: doc.brand ? String(doc.brand) : undefined,
  }
}

export function filterLowStockProducts(
  products: Record<string, any>[],
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): LowStockProduct[] {
  return products
    .map((p) => toLowStockProduct(p, threshold))
    .filter((p): p is LowStockProduct => p !== null)
    .sort((a, b) => a.stock - b.stock)
}

export interface LowStockSummary {
  threshold: number
  total: number
  outOfStock: number
  low: number
  products: LowStockProduct[]
}

export function summarizeLowStock(
  products: Record<string, any>[],
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): LowStockSummary {
  const list = filterLowStockProducts(products, threshold)
  return {
    threshold,
    total: list.length,
    outOfStock: list.filter((p) => p.level === "out_of_stock").length,
    low: list.filter((p) => p.level === "low").length,
    products: list,
  }
}
