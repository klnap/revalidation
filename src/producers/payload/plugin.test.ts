import { describe, expect, it } from 'bun:test'
import type { Config } from 'payload'

import type { DispatchOutcome } from '../../core'
import { http } from '../../dispatchers/http/index.js'

import { revalidation } from './plugin.ts'
import { readRevalidationCustom } from './revalidation-custom.ts'

const source = 'https://cms.example/revalidation'

describe('readRevalidationCustom', () => {
  it('reads true', () => {
    expect(readRevalidationCustom({ revalidation: true })).toBe(true)
  })

  it('reads options object', () => {
    expect(readRevalidationCustom({ revalidation: { hooks: ['afterChange'] } })).toEqual({
      hooks: ['afterChange'],
    })
  })

  it('returns null when absent', () => {
    expect(readRevalidationCustom({})).toBeNull()
  })

  it('returns null when enabled false', () => {
    expect(readRevalidationCustom({ revalidation: { enabled: false } })).toBeNull()
  })
})

describe('revalidation plugin', () => {
  it('accepts an explicitly constructed dispatcher without depending on HTTP', () => {
    const plugin = revalidation({
      source,
      dispatcher: http({
        targets: {
          website: {
            url: 'https://example.test/revalidate',
            secret: `whsec_${Buffer.from('producer-test-secret').toString('base64')}`,
          },
        },
      }),
    })

    expect(plugin({ collections: [] } as unknown as Config)).toBeDefined()
    expect(() =>
      http({
        targets: {
          website: {
            url: 'not a URL',
            secret: `whsec_${Buffer.from('producer-test-secret').toString('base64')}`,
          },
        },
      }),
    ).toThrow()
    expect(() =>
      revalidation({
        source,
        dispatcher: { targets: {} } as never,
      }),
    ).toThrow('dispatcher must implement the Dispatcher contract')
    expect(() =>
      revalidation({
        source: 'not-an-absolute-uri',
        dispatcher: { dispatch: async () => ({ status: 'accepted' as const, results: [] }) },
      }),
    ).toThrow('source must be an absolute URI')
  })

  it('wires hooks from custom.revalidation only', () => {
    const plugin = revalidation({
      source,
      dispatcher: {
        default: {
          dispatch: async () => ({ status: 'accepted' as const, results: [] }),
        },
      },
    })

    const config = plugin({
      collections: [
        { slug: 'projects', fields: [], custom: { revalidation: true } },
        { slug: 'users', fields: [] },
      ],
      globals: [
        { slug: 'home-page', fields: [], custom: { revalidation: true } },
        { slug: 'settings', fields: [] },
      ],
    } as unknown as Config) as Config

    expect(config.collections?.[0]?.hooks?.afterChange).toBeDefined()
    expect(config.collections?.[0]?.hooks?.afterDelete).toBeDefined()
    expect(config.collections?.[1]?.hooks?.afterChange).toBeUndefined()
    expect(config.globals?.[0]?.hooks?.afterChange).toBeDefined()
    expect(config.globals?.[1]?.hooks?.afterChange).toBeUndefined()
  })

  it('preserves host collections and endpoints without adding queue infrastructure', () => {
    const endpoint = { path: '/host-endpoint', method: 'get' } as never
    const plugin = revalidation({
      source,
      dispatcher: { dispatch: async () => ({ status: 'accepted' as const, results: [] }) },
    })
    const config = plugin({
      collections: [{ slug: 'host-collection', fields: [] }],
      endpoints: [endpoint],
    } as unknown as Config) as Config

    expect(config.collections).toHaveLength(1)
    expect(config.collections?.[0]?.slug).toBe('host-collection')
    expect(config.endpoints).toEqual([endpoint])
  })

  it('rejects applying the plugin twice instead of duplicating revalidation hooks', () => {
    const plugin = revalidation({
      source,
      dispatcher: {
        dispatch: async () => ({ status: 'accepted' as const, results: [] }),
      },
    })
    const once = plugin({
      collections: [{ slug: 'projects', fields: [], custom: { revalidation: true } }],
    } as unknown as Config) as Config

    expect(() => plugin({ ...once })).toThrow('plugin is already applied')
  })

  it('uses dispatcher default/fallback on failed', async () => {
    const calls: string[] = []
    const primary = {
      dispatch: async (_input: unknown) => {
        calls.push('default')
        return {
          status: 'failed' as const,
          results: [
            { target: 'website', deliveryId: 'wh_1', status: 'failed' as const, attempts: 1 },
          ],
        }
      },
    }
    const fallback = {
      dispatch: async (_input: unknown) => {
        calls.push('fallback')
        return { status: 'accepted' as const, results: [] }
      },
    }
    const plugin = revalidation({
      source,
      dispatcher: { default: primary, fallback },
    })

    await plugin({ collections: [], globals: [] } as unknown as Config)

    const { postRevalidationChanges } = await import('./lifecycle/helpers.ts')
    await postRevalidationChanges({
      changes: [
        {
          type: 'collection',
          slug: 'projects',
          operation: 'update',
          locale: 'pl',
          doc: { id: '1', slug: 'a' },
        },
      ],
      source,
      logger: { warn: () => {}, info: () => {}, error: () => {} },
      dispatcher: {
        async dispatch(input) {
          const first = (await primary.dispatch(input)) as DispatchOutcome
          if (first.status === 'accepted') return first
          if (first.status === 'unknown' || first.status === 'rejected') return first
          return fallback.dispatch(input)
        },
      },
    })

    expect(calls).toEqual(['default', 'fallback'])
  })

  it('uses fallback when default dispatch throws', async () => {
    const calls: string[] = []
    const primary = {
      dispatch: async (_input: unknown) => {
        calls.push('default')
        throw new Error('HTTP 503 Service Unavailable')
      },
    }
    const fallback = {
      dispatch: async (_input: unknown) => {
        calls.push('fallback')
        return { status: 'accepted' as const, results: [] }
      },
    }
    const plugin = revalidation({
      source,
      dispatcher: { default: primary, fallback },
    })

    await plugin({ collections: [], globals: [] } as unknown as Config)

    const { postRevalidationChanges } = await import('./lifecycle/helpers.ts')
    await postRevalidationChanges({
      changes: [
        {
          type: 'collection',
          slug: 'projects',
          operation: 'update',
          locale: 'pl',
          doc: { id: '1' },
        },
      ],
      source,
      logger: { warn: () => {}, info: () => {}, error: () => {} },
      dispatcher: {
        async dispatch(input) {
          try {
            return await primary.dispatch(input)
          } catch {
            return fallback.dispatch(input)
          }
        },
      },
    })

    expect(calls).toEqual(['default', 'fallback'])
  })
})
