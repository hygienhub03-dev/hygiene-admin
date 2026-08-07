import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { enforceRateLimit, enforceTrustedOrigin } from '../route-security'

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new Request(url, { headers }))
}

describe('enforceRateLimit', () => {
  it('allows requests under the limit', () => {
    const req = makeRequest('https://admin.example.com/api/orders/1', {
      'x-forwarded-for': '10.0.0.1',
    })
    for (let i = 0; i < 3; i++) {
      const result = enforceRateLimit(req, 'test-under-limit', 5, 60_000)
      assert.equal(result, null)
    }
  })

  it('blocks requests once the limit is exceeded', () => {
    const req = makeRequest('https://admin.example.com/api/orders/1', {
      'x-forwarded-for': '10.0.0.2',
    })
    const keyPrefix = 'test-over-limit'
    for (let i = 0; i < 2; i++) {
      assert.equal(enforceRateLimit(req, keyPrefix, 2, 60_000), null)
    }
    const blocked = enforceRateLimit(req, keyPrefix, 2, 60_000)
    assert.notEqual(blocked, null)
  })

  it('tracks separate IPs independently', () => {
    const keyPrefix = 'test-per-ip'
    const reqA = makeRequest('https://admin.example.com/api/orders/1', { 'x-forwarded-for': '10.0.0.3' })
    const reqB = makeRequest('https://admin.example.com/api/orders/1', { 'x-forwarded-for': '10.0.0.4' })
    assert.equal(enforceRateLimit(reqA, keyPrefix, 1, 60_000), null)
    // Different IP, same bucket prefix — should not be blocked by A's usage.
    assert.equal(enforceRateLimit(reqB, keyPrefix, 1, 60_000), null)
  })
})

describe('enforceTrustedOrigin', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env.ADMIN_TRUSTED_ORIGINS = originalEnv.ADMIN_TRUSTED_ORIGINS
    process.env.NEXT_PUBLIC_APP_ORIGIN = originalEnv.NEXT_PUBLIC_APP_ORIGIN
  })

  it('allows requests with no Origin header (e.g. server-to-server)', () => {
    const req = makeRequest('https://admin.example.com/api/orders/1')
    assert.equal(enforceTrustedOrigin(req), null)
  })

  it('allows a request from a configured trusted origin', () => {
    process.env.ADMIN_TRUSTED_ORIGINS = 'https://admin.hygienhub.co.za'
    const req = makeRequest('https://admin.hygienhub.co.za/api/orders/1', {
      origin: 'https://admin.hygienhub.co.za',
    })
    assert.equal(enforceTrustedOrigin(req), null)
  })

  it('rejects a request from an untrusted origin', () => {
    process.env.ADMIN_TRUSTED_ORIGINS = 'https://admin.hygienhub.co.za'
    const req = makeRequest('https://admin.hygienhub.co.za/api/orders/1', {
      origin: 'https://evil.example.com',
    })
    const result = enforceTrustedOrigin(req)
    assert.notEqual(result, null)
  })
})
