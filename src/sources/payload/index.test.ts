import { describe, expect, it } from 'bun:test'
import { payloadRevalidationSource } from './index.js'

describe('payloadRevalidationSource', () => {
  it('does not fall back to legacy collection or global fields for an empty key', () => {
    const source = payloadRevalidationSource()
    expect(() =>
      source.resolve({ operation: 'update', locale: 'en', key: '', collection: 'projects' }),
    ).toThrow()
  })
})
