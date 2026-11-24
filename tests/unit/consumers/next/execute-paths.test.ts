import { afterEach, describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { processHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'
import { payloadRevalidationItemSchema } from '../../../../src/sources/payload'

describe('custom execute receives paths', () => {
  afterEach(() => {})

  it('passes path entries to execute hook', async () => {
    const received: { paths: string[] } = { paths: [] }

    const { config } = compileHostRevalidation({
      secret: 's',
      tags: { homePage: '[locale]:home' },
      paths: { homePath: '/[locale]' },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: () => 'home-page',
        },
      },
      layers: (_t, p) => ({
        purge: [{ key: { payload: 'home-page' }, invalidates: { paths: [p.homePath] } }],
      }),
      execute: {
        purge: async ({ paths }) => {
          received.paths = paths.map((e) => e.value)
        },
      },
    })

    const result = await processHostEnvelope(
      config.host!,
      {
        source: 'payload',
        data: { operation: 'update', locale: 'en', key: 'home-page', global: 'home-page' },
      },
      'req-1',
      'expire',
      100,
    )

    const purge = config.execute?.purge
    if (!purge) throw new Error('missing execute.purge')
    await purge({
      ...result.layers.purge!,
      requestId: 'req-1',
      source: result.source,
      cacheKeys: result.cacheKeys,
    })

    expect(received.paths).toEqual(['/en'])
  })
})
