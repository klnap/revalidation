import { afterEach, describe, expect, it } from 'bun:test'
import {
  getDefinedRevalidation,
  resetDefinedRevalidation,
} from '../../../../src/consumers/next/define-revalidation'
import { defineRevalidation, invalidKey } from '../../../../src/consumers/next/index'
import { inspectHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'

afterEach(resetDefinedRevalidation)

// Mirrors the declarations in README.md, Quick start step 2.
const declare = () =>
  defineRevalidation({
    secret: 'secret',
    tags: {
      page: '[locale]:page:[slug]',
      siteSettings: '[locale]:site-settings',
    },
    resolve: (event) => event.key ?? invalidKey(),
    invalidate: (cacheTags) => ({
      pages: [cacheTags.page],
      'site-settings': [cacheTags.siteSettings],
    }),
  })

const inspect = (envelope: unknown) => {
  const host = getDefinedRevalidation().host
  if (!host) throw new Error('host config missing')
  return inspectHostEnvelope(host, envelope as never, 'expire', 100)
}

describe('README quick start', () => {
  it('a page event expires the tag the cached page function registers', () => {
    const { tags } = declare()
    const result = inspect({
      source: 'payload',
      data: [
        { operation: 'update', locale: 'en', key: 'pages', collection: 'pages', slug: 'about' },
      ],
    })
    expect(tags.page({ locale: 'en', slug: 'about' })).toBe('en:page:about')
    expect(result.layers.next?.tags.map((t) => t.value)).toEqual(['en:page:about'])
  })

  it('a global event expires the settings tag for its locale', () => {
    const { tags } = declare()
    const result = inspect({
      source: 'payload',
      data: [{ operation: 'update', locale: 'en', key: 'site-settings', global: 'site-settings' }],
    })
    expect(tags.siteSettings({ locale: 'en' })).toBe('en:site-settings')
    expect(result.layers.next?.tags.map((t) => t.value)).toEqual(['en:site-settings'])
  })
})
