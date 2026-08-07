import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractBearerToken } from '../admin-auth'

describe('extractBearerToken', () => {
  it('extracts the token from a standard Bearer header', () => {
    assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  })

  it('is case-insensitive on the "Bearer" keyword', () => {
    assert.equal(extractBearerToken('bearer abc.def.ghi'), 'abc.def.ghi')
  })

  it('returns undefined for a missing header', () => {
    assert.equal(extractBearerToken(null), undefined)
    assert.equal(extractBearerToken(undefined), undefined)
  })

  it('returns undefined for a non-Bearer scheme', () => {
    assert.equal(extractBearerToken('Basic dXNlcjpwYXNz'), undefined)
  })

  it('returns undefined for an empty string', () => {
    assert.equal(extractBearerToken(''), undefined)
  })
})
