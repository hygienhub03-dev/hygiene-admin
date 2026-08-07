import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  classifyStock,
  isLowStock,
  toLowStockProduct,
  filterLowStockProducts,
  summarizeLowStock,
  getLowStockThreshold,
} from "../low-stock"

describe("classifyStock", () => {
  it("marks zero and negative as out_of_stock", () => {
    assert.equal(classifyStock(0), "out_of_stock")
    assert.equal(classifyStock(-1), "out_of_stock")
  })

  it("marks stock at or below threshold as low", () => {
    assert.equal(classifyStock(1, 10), "low")
    assert.equal(classifyStock(10, 10), "low")
  })

  it("marks stock above threshold as ok", () => {
    assert.equal(classifyStock(11, 10), "ok")
    assert.equal(classifyStock(100, 10), "ok")
  })
})

describe("isLowStock", () => {
  it("includes zero and values at the threshold", () => {
    assert.equal(isLowStock(0), true)
    assert.equal(isLowStock(DEFAULT_LOW_STOCK_THRESHOLD), true)
    assert.equal(isLowStock(DEFAULT_LOW_STOCK_THRESHOLD + 1), false)
  })
})

describe("toLowStockProduct", () => {
  it("returns null when stock is healthy", () => {
    assert.equal(toLowStockProduct({ id: "1", name: "Soap", stock: 50 }), null)
  })

  it("maps title/name and nested category", () => {
    const item = toLowStockProduct({
      id: "abc",
      title: "Face Serum",
      stock: 3,
      category: { name: "Skincare" },
      brand: "Hygien",
    })
    assert.ok(item)
    assert.equal(item!.id, "abc")
    assert.equal(item!.title, "Face Serum")
    assert.equal(item!.stock, 3)
    assert.equal(item!.level, "low")
    assert.equal(item!.category, "Skincare")
    assert.equal(item!.brand, "Hygien")
  })

  it("treats totalStock alias and zero as out_of_stock", () => {
    const item = toLowStockProduct({ id: "x", name: "Oil", totalStock: 0 })
    assert.ok(item)
    assert.equal(item!.level, "out_of_stock")
    assert.equal(item!.title, "Oil")
  })
})

describe("filterLowStockProducts / summarizeLowStock", () => {
  const products = [
    { id: "1", name: "A", stock: 0 },
    { id: "2", name: "B", stock: 5 },
    { id: "3", name: "C", stock: 50 },
    { id: "4", name: "D", stock: 10 },
  ]

  it("filters and sorts ascending by stock", () => {
    const list = filterLowStockProducts(products, 10)
    assert.equal(list.length, 3)
    assert.deepEqual(
      list.map((p) => p.id),
      ["1", "2", "4"],
    )
  })

  it("summarizes counts", () => {
    const summary = summarizeLowStock(products, 10)
    assert.equal(summary.threshold, 10)
    assert.equal(summary.total, 3)
    assert.equal(summary.outOfStock, 1)
    assert.equal(summary.low, 2)
  })
})

describe("getLowStockThreshold", () => {
  it("prefers explicit numeric value", () => {
    assert.equal(getLowStockThreshold(5), 5)
    assert.equal(getLowStockThreshold("7"), 7)
  })

  it("falls back to default when invalid", () => {
    assert.equal(getLowStockThreshold("nope"), DEFAULT_LOW_STOCK_THRESHOLD)
    assert.equal(getLowStockThreshold(undefined), DEFAULT_LOW_STOCK_THRESHOLD)
  })
})
