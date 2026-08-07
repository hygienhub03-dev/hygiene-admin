import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  getWebhookUrls,
  resolveWebhookEvents,
  buildWebhookPayload,
  signWebhookBody,
  verifyWebhookSignature,
  deliverWebhook,
} from "../order-webhooks"

describe("getWebhookUrls", () => {
  it("returns empty for blank input", () => {
    assert.deepEqual(getWebhookUrls(""), [])
    assert.deepEqual(getWebhookUrls(undefined), [])
    assert.deepEqual(getWebhookUrls("  "), [])
  })

  it("parses comma-separated https URLs", () => {
    assert.deepEqual(
      getWebhookUrls("https://a.example/hook, https://b.example/hook"),
      ["https://a.example/hook", "https://b.example/hook"],
    )
  })

  it("drops invalid entries", () => {
    assert.deepEqual(
      getWebhookUrls("not-a-url, https://ok.example/x, ftp://bad"),
      ["https://ok.example/x"],
    )
  })
})

describe("resolveWebhookEvents", () => {
  it("emits status_changed on genuine status transition", () => {
    assert.deepEqual(
      resolveWebhookEvents({
        orderStatus: "processing",
        previousOrderStatus: "waiting",
      }),
      ["order.status_changed"],
    )
  })

  it("emits shipment_changed on genuine shipment transition", () => {
    assert.deepEqual(
      resolveWebhookEvents({
        shipmentStatus: "shipped",
        previousShipmentStatus: "processing",
      }),
      ["order.shipment_changed"],
    )
  })

  it("emits both when both change", () => {
    assert.deepEqual(
      resolveWebhookEvents({
        orderStatus: "shipped",
        previousOrderStatus: "processing",
        shipmentStatus: "shipped",
        previousShipmentStatus: "packed",
      }),
      ["order.status_changed", "order.shipment_changed"],
    )
  })

  it("emits nothing when status is unchanged", () => {
    assert.deepEqual(
      resolveWebhookEvents({
        orderStatus: "processing",
        previousOrderStatus: "processing",
        shipmentStatus: "packed",
        previousShipmentStatus: "packed",
      }),
      [],
    )
  })
})

describe("buildWebhookPayload", () => {
  it("shapes the payload with event and order fields", () => {
    const payload = buildWebhookPayload(
      {
        orderId: "ord-1",
        userEmail: "c@example.com",
        orderStatus: "shipped",
        previousOrderStatus: "processing",
        shipmentStatus: "shipped",
        trackingNumber: "T1",
        carrier: "TCG",
      },
      "order.status_changed",
      new Date("2026-08-07T12:00:00.000Z"),
    )
    assert.equal(payload.event, "order.status_changed")
    assert.equal(payload.timestamp, "2026-08-07T12:00:00.000Z")
    assert.equal(payload.order.id, "ord-1")
    assert.equal(payload.order.trackingNumber, "T1")
    assert.equal(payload.order.previousStatus, "processing")
  })
})

describe("signWebhookBody / verifyWebhookSignature", () => {
  it("round-trips a valid signature", () => {
    const body = JSON.stringify({ hello: "world" })
    const secret = "test-secret"
    const sig = signWebhookBody(body, secret)
    assert.match(sig, /^sha256=[a-f0-9]{64}$/)
    assert.equal(verifyWebhookSignature(body, sig, secret), true)
  })

  it("rejects a tampered body", () => {
    const sig = signWebhookBody('{"a":1}', "secret")
    assert.equal(verifyWebhookSignature('{"a":2}', sig, "secret"), false)
  })
})

describe("deliverWebhook", () => {
  it("POSTs JSON and reports success", async () => {
    const calls: any[] = []
    const fetchImpl = async (url: any, init: any) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        text: async () => "ok",
      } as Response
    }

    const result = await deliverWebhook(
      "https://hooks.example/order",
      buildWebhookPayload(
        { orderId: "x", orderStatus: "processing", previousOrderStatus: "waiting" },
        "order.status_changed",
      ),
      { secret: "s3cret", fetchImpl: fetchImpl as any },
    )

    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.method, "POST")
    assert.equal(calls[0].init.headers["Content-Type"], "application/json")
    assert.match(calls[0].init.headers["X-Hygienhub-Signature"], /^sha256=/)
    assert.equal(calls[0].init.headers["X-Hygienhub-Event"], "order.status_changed")
  })

  it("reports failure on non-2xx", async () => {
    const fetchImpl = async () =>
      ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "boom",
      }) as Response

    const result = await deliverWebhook(
      "https://hooks.example/order",
      buildWebhookPayload({ orderId: "x" }, "order.updated"),
      { fetchImpl: fetchImpl as any },
    )

    assert.equal(result.ok, false)
    assert.equal(result.status, 500)
    assert.equal(result.error, "boom")
  })
})
