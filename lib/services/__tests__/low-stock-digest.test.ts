import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { getAdminDigestRecipients } from "../low-stock-digest"

describe("getAdminDigestRecipients", () => {
  const keys = [
    "ADMIN_DIGEST_EMAILS",
    "ADMIN_EMAIL",
    "LOW_STOCK_DIGEST_EMAILS",
  ] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it("returns empty when nothing configured", () => {
    assert.deepEqual(getAdminDigestRecipients(), [])
  })

  it("parses comma-separated ADMIN_DIGEST_EMAILS", () => {
    process.env.ADMIN_DIGEST_EMAILS = "ops@hygienhub.co.za, stock@hygienhub.co.za"
    assert.deepEqual(getAdminDigestRecipients(), [
      "ops@hygienhub.co.za",
      "stock@hygienhub.co.za",
    ])
  })

  it("falls back to ADMIN_EMAIL", () => {
    process.env.ADMIN_EMAIL = "admin@hygienhub.co.za"
    assert.deepEqual(getAdminDigestRecipients(), ["admin@hygienhub.co.za"])
  })

  it("filters invalid entries", () => {
    process.env.ADMIN_DIGEST_EMAILS = "good@x.com, not-an-email, also@y.com"
    assert.deepEqual(getAdminDigestRecipients(), ["good@x.com", "also@y.com"])
  })
})
