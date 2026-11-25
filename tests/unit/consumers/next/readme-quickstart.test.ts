import { describe, expect, it } from 'bun:test'
import { defineRevalidation, invalidKey } from '../../../../src/consumers/next/index'

const run = async (event: unknown) => {
  const executed: { tags: string[]; paths: string[] }[] = []
  const { tags, paths, POST } = defineRevalidation({
    secret: 'secret',
    tags: {
      page: '[locale]:page:[slug]',
      siteSettings: '[locale]:site-settings',
    },
    paths: { page: '/[locale]/[slug]' },
    resolve: (item) => item.key ?? invalidKey(),
    rules: ({ tags: cacheTags, paths: cachePaths }) => ({
      pages: { tags: [cacheTags.page], paths: [cachePaths.page] },
      'site-settings': [cacheTags.siteSettings],
    }),
    execute: {
      next: async ({ tags, paths: cachePaths }) => {
        executed.push({
          tags: tags.map((tag) => tag.value),
          paths: cachePaths.map((path) => path.value),
        })
      },
    },
  })

  const response = await POST(
    new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }),
  )

  return { response, executed, tags, paths }
}

describe('README quick start', () => {
  it('invalidates the same page tag and path registered by the cached function', async () => {
    const result = await run({
      source: 'payload',
      data: {
        operation: 'update',
        locale: 'en',
        key: 'pages',
        collection: 'pages',
        slug: 'about',
      },
    })

    expect(result.response.status).toBe(200)
    expect(result.tags.page({ locale: 'en', slug: 'about' })).toBe('en:page:about')
    expect(result.paths.page({ locale: 'en', slug: 'about' })).toBe('/en/about')
    expect(result.executed).toEqual([{ tags: ['en:page:about'], paths: ['/en/about'] }])
  })

  it('invalidates a localized global settings tag', async () => {
    const result = await run({
      source: 'payload',
      data: {
        operation: 'update',
        locale: 'en',
        key: 'site-settings',
        global: 'site-settings',
      },
    })

    expect(result.response.status).toBe(200)
    expect(result.tags.siteSettings({ locale: 'en' })).toBe('en:site-settings')
    expect(result.executed).toEqual([{ tags: ['en:site-settings'], paths: [] }])
  })
})
