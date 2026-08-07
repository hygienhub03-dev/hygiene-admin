import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  shouldCommitInventory,
  detectLowStockTransition,
} from "../inventory"

describe("shouldCommitInventory", () => {
  it("commits when moving from waiting into processing", () => {
    assert.equal(shouldCommitInventory("processing", "waiting"), true)
  })

  it("commits when jumping straight from waiting to shipped", () => {
    assert.equal(shouldCommitInventory("shipped", "waiting"), true)
  })

  it("commits when previous status is null/undefined", () => {
    assert.equal(shouldCommitInventory("processing", null), true)
    assert.equal(shouldCommitInventory("shipped", undefined), true)
  })

  it("does not re-commit once already in a fulfilment status", () => {
    assert.equal(shouldCommitInventory("shipped", "processing"), false)
    assert.equal(shouldCommitInventory("delivered", "shipped"), false)
    assert.equal(shouldCommitInventory("delivered", "processing"), false)
  })

  it("does not commit for non-fulfilment statuses", () => {
    assert.equal(shouldCommitInventory("waiting", null), false)
    assert.equal(shouldCommitInventory("cancelled", "waiting"), false)
    assert.equal(shouldCommitInventory("returned", "delivered"), false)
  })

  it("does not commit when there is no new status", () => {
    assert.equal(shouldCommitInventory(undefined, "waiting"), false)
  })
})

describe("detectLowStockTransition", () => {
  it("returns null when stock stays healthy", () => {
    assert.equal(
      detectLowStockTransition(50, 40, { id: "1", name: "Soap" }, 10),
      null,
    )
  })

  it("detects crossing into low stock", () => {
    const result = detectLowStockTransition(15, 8, { id: "2", name: "Serum" }, 10)
    assert.ok(result)
    assert.equal(result!.level, "low")
    assert.equal(result!.stock, 8)
    assert.equal(result!.title, "Serum")
  })

  it("detects crossing into out of stock", () => {
    const result = detectLowStockTransition(5, 0, { id: "3", name: "Oil" }, 10)
    assert.ok(result)
    assert.equal(result!.level, "out_of_stock")
  })

  it("still reports when already low and stock drops further", () => {
    const result = detectLowStockTransition(5, 2, { id: "4", name: "Cream" }, 10)
    assert.ok(result)
    assert.equal(result!.stock, 2)
  })

  it("returns null when restocking above threshold", () => {
    assert.equal(
      detectLowStockTransition(2, 50, { id: "5", name: "Toner" }, 10),
      null,
    )
  })
})
