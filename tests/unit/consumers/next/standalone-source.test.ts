import { describe, expect, it } from 'bun:test'
import * as v from 'valibot'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { inspectHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'

// Mirrors the "Without a CMS" example in README.md.
describe('consumer with a custom source', () => {
  const { runtime } = compileHostRevalidation({
    secret: 's',
    tags: { pricing: 'pricing' },
    sources: {
      webhook: {
        schema: v.object({ key: v.string() }),
        resolve: ({ item }) => (item as { key: string }).key,
      },
    },
    layers: ({ tags }) => ({
      next: [{ key: { webhook: 'pricing' }, invalidates: [tags.pricing] }],
    }),
  })

  it('maps a webhook event to its cache tag', () => {
    const result = inspectHostEnvelope(
      runtime,
      { source: 'webhook', data: [{ key: 'pricing' }] },
      'expire',
      100,
    )
    expect(result.layers.next?.tags.map((t) => t.value)).toEqual(['pricing'])
  })

  it('skips an item that fails the schema', () => {
    const result = inspectHostEnvelope(
      runtime,
      { source: 'webhook', data: [{ nope: 1 }] },
      'expire',
      100,
    )
    expect(result.cacheKeys).toEqual([])
  })
})
