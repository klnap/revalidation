import { afterEach, describe, expect, it } from 'bun:test'

import {
  defineRevalidation,
  getDefinedRevalidation,
  invalidKey,
  resetDefinedRevalidation,
} from '../../../../src/consumers/next/index'
import { inspectHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'

afterEach(resetDefinedRevalidation)

// Mirrors the Quick Start in README.md.
describe('README quick start', () => {
  it('maps a Payload page event to the tag used by the cached data', () => {
    const { tags } = defineRevalidation({
      secret: 'secret',
      tags: { page: '[locale]:page:[slug]' },
      resolve: (event) => event.key ?? invalidKey(),
      invalidate: (cacheTags) => ({ pages: [cacheTags.page] }),
    })

    const host = getDefinedRevalidation().host
    if (!host) throw new Error('host config missing')
    const result = inspectHostEnvelope(
      host,
      {
        source: 'payload',
        data: {
          operation: 'update',
          locale: 'en',
          key: 'pages',
          collection: 'pages',
          slug: 'about',
        },
      },
      'expire',
      100,
    )

    expect(tags.page({ locale: 'en', slug: 'about' })).toBe('en:page:about')
    expect(result.layers.next?.tags.map((t) => t.value)).toEqual(['en:page:about'])
  })
})
