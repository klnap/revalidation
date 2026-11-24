import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { processHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'
import { payloadRevalidationItemSchema } from '../../../../src/sources/payload'

describe('processHostEnvelope prepare', () => {
  it('runs rule.prepare only for matched rule', async () => {
    let prepareCalls = 0
    const { runtime } = compileHostRevalidation({
      secret: 's',
      tags: {
        homePage: '[locale]:home-page',
        enriched: '[locale]:enriched',
      },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: ({ item }) => (item as { key: string }).key,
          params: ({ item }) => ({ locale: (item as { locale: string }).locale }),
        },
      },
      layers: (t) => ({
        next: [
          {
            key: { payload: 'home-page' },
            invalidates: [t.homePage],
          },
          {
            key: { payload: 'enriched-page' },
            prepare: async () => {
              prepareCalls += 1
              return { extra: true }
            },
            invalidates: [t.enriched],
          },
        ],
      }),
    })

    await processHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: {
          operation: 'update',
          locale: 'pl',
          key: 'home-page',
          global: 'home-page',
        },
      },
      'req-1',
      'expire',
      100,
    )

    expect(prepareCalls).toBe(0)

    await processHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: {
          operation: 'update',
          locale: 'pl',
          key: 'enriched-page',
          global: 'enriched-page',
        },
      },
      'req-2',
      'expire',
      100,
    )

    expect(prepareCalls).toBe(1)
  })
})
