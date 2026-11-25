import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { createCache, logRevalidationDebug } from '../../../../src/consumers/next/create-cache'
import type { InspectResult } from '../../../../src/core'
import { payloadRevalidationItemSchema } from '../../../../src/sources/payload'

describe('revalidation debug logging', () => {
  it('logRevalidationDebug calls logger.debug with cacheKeys and layer tags', () => {
    const calls: { entry: Record<string, unknown>; message: string }[] = []

    const result: InspectResult = {
      source: 'payload',
      items: [{ locale: 'en', collection: 'projects', slug: 'x' }],
      cacheKeys: ['projects'],
      layers: {
        next: {
          tags: [{ value: 'en:project:x', mode: 'expire' }],
          paths: [],
        },
      },
    }

    logRevalidationDebug(
      {
        debug: (entry, message) => {
          calls.push({ entry, message })
        },
      },
      'req-1',
      { source: 'payload', data: result.items[0] },
      result,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.message).toBe('cache.revalidate.processed')
    expect(calls[0]?.entry).not.toHaveProperty('data')
    expect(calls[0]?.entry.cacheKeys).toEqual(['projects'])
    expect(calls[0]?.entry.layers).toEqual({ next: { tags: ['en:project:x'], paths: [] } })
  })

  it('logRevalidationDebug is a no-op without logger.debug', () => {
    logRevalidationDebug(
      { error: () => {} },
      'req-1',
      { source: 'payload', data: {} },
      { source: 'payload', items: [], cacheKeys: [], layers: {} },
    )
  })

  it('processEnvelope emits debug when logger.debug is set', async () => {
    const debugCalls: Record<string, unknown>[] = []

    const { config } = compileHostRevalidation({
      secret: 's',
      logger: {
        debug: (entry) => {
          debugCalls.push(entry)
        },
      },
      tags: {
        project: '[locale]:project:[slug]',
      },
      resolve: ({ item }) => (item as { key: string }).key,
      rules: ({ tags: tag }) => ({
        projects: [tag.project],
      }),
    })

    const cache = createCache(config)
    await cache.route(
      new Request('http://localhost/api/revalidate', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer s',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'payload',
          data: {
            operation: 'update',
            locale: 'en',
            key: 'projects',
            collection: 'projects',
            slug: 'tower',
          },
        }),
      }),
    )

    expect(debugCalls.length).toBeGreaterThanOrEqual(1)
    const last = debugCalls[debugCalls.length - 1]
    expect(last?.cacheKeys).toEqual(['projects'])
    expect(last?.layers).toEqual({ next: { tags: ['en:project:tower'], paths: [] } })
  })

  it('does not call debug when logger is omitted', async () => {
    const { config } = compileHostRevalidation({
      secret: 's',
      tags: { homePage: '[locale]:home' },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: () => 'home-page',
        },
      },
      layers: ({ tags: t }) => ({
        next: [{ key: { payload: 'home-page' }, invalidates: [t.homePage] }],
      }),
    })

    const cache = createCache(config)
    await cache.route(
      new Request('http://localhost/api/revalidate', {
        method: 'POST',
        headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'payload',
          data: {
            operation: 'update',
            locale: 'en',
            key: 'home-page',
            global: 'home-page',
          },
        }),
      }),
    )
  })
})
