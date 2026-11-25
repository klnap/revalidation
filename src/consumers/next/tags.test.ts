import { describe, expect, it } from 'bun:test'
import { defineRevalidationTags } from './tags.js'

describe('defineRevalidationTags', () => {
  it('builds typed tag and path helpers without a handler secret', () => {
    const { tags, paths } = defineRevalidationTags({
      tags: { page: '[locale]:page:[slug]' },
      paths: { page: '/[locale]/[slug]' },
    })

    expect(tags.page({ locale: 'en', slug: 'about' })).toBe('en:page:about')
    expect(paths.page({ locale: 'en', slug: 'about' })).toBe('/en/about')
  })

  it('supports tag-only and path-only declarations', () => {
    const tagOnly = defineRevalidationTags({ tags: { navigation: 'navigation' } })
    const pathOnly = defineRevalidationTags({ paths: { home: '/' } })

    expect(tagOnly.tags.navigation()).toBe('navigation')
    expect(pathOnly.paths.home()).toBe('/')
  })

  it('rejects empty declarations', () => {
    expect(() => defineRevalidationTags({} as never)).toThrow(
      'defineRevalidationTags: provide tags or paths',
    )
  })
})
