import { describe, expect, it } from 'bun:test'
import { payloadRevalidationSource } from './index.js'

describe('payloadRevalidationSource', () => {
  it('rejects an empty source key', () => {
    const source = payloadRevalidationSource()
    expect(() => source.resolve({ operation: 'update', locale: 'en', key: '' })).toThrow()
  })
})
