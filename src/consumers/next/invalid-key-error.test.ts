import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from './compile-revalidation-host.ts'
import { InvalidKeyError, invalidKey } from './invalid-key-error.ts'
import { inspectHostEnvelope } from './process-host-envelope.ts'

describe('invalidKey', () => {
  it('throws InvalidKeyError', () => {
    expect(() => invalidKey()).toThrow(InvalidKeyError)
  })
  it('is skipped on inspect (no throw to caller)', () => {
    const { runtime } = compileHostRevalidation({
      secret: 's',
      resolve: () => invalidKey(),
      tags: { homePage: '[locale]:home-page' },
      rules: ({ tags: tag }) => ({ 'home-page': [tag.homePage] }),
    })

    const result = inspectHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: { locale: 'en', global: 'home-page' },
      },
      'expire',
      100,
    )
    expect(result.cacheKeys).toEqual([])
  })
})
