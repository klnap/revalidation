import { describe, expect, it } from 'bun:test'

import { isLocaleRestoreReq, markLocaleRestoreReq } from './restore-guard.ts'

describe('locale restore guard', () => {
  it('does not treat an unmarked request as a restore request', () => {
    const req = { context: { preserveLocalesRestore: true } } as unknown
    expect(isLocaleRestoreReq(req)).toBe(false)
  })

  it('marks only the intended request object', () => {
    const req = {} as unknown
    markLocaleRestoreReq(req as object)
    expect(isLocaleRestoreReq(req)).toBe(true)
    expect(isLocaleRestoreReq({})).toBe(false)
  })

  it('is scoped per request object and does not leak', () => {
    const a = {} as unknown
    const b = {} as unknown
    markLocaleRestoreReq(a as object)
    expect(isLocaleRestoreReq(a)).toBe(true)
    expect(isLocaleRestoreReq(b)).toBe(false)
  })
})
