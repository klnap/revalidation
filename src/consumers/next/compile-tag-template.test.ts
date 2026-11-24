import { describe, expect, it } from 'bun:test'

import { compileTagTemplate } from './compile-tag-template.ts'
import { buildTagDefs } from './registry-builders.ts'
import { resolveTagEntries } from './resolve-tag-params.ts'

describe('compileTagTemplate', () => {
  it('renders locale-only template', () => {
    const compiled = compileTagTemplate('[locale]:home-page')
    expect(compiled.keys).toEqual(['locale'])
    expect(compiled.usesSlug).toBe(false)
    expect(compiled.render({ locale: 'en' })).toBe('en:home-page')
  })

  it('renders locale and slug', () => {
    const compiled = compileTagTemplate('[locale]:project:[slug]')
    expect(compiled.render({ locale: 'pl', slug: 'tower' })).toBe('pl:project:tower')
    expect(compiled.usesSlug).toBe(true)
  })

  it('returns null when a required key is missing', () => {
    const compiled = compileTagTemplate('[locale]:project:[slug]')
    expect(compiled.render({ locale: 'pl' })).toBeNull()
    expect(compiled.render({ locale: 'pl', slug: '' })).toBeNull()
  })

  it('supports arbitrary param names', () => {
    const compiled = compileTagTemplate('[locale]:offer:[commerceId]')
    expect(compiled.keys).toEqual(['locale', 'commerceId'])
    expect(compiled.render({ locale: 'de', commerceId: 'sku-1' })).toBe('de:offer:sku-1')
  })

  it('reuses duplicate placeholders', () => {
    const compiled = compileTagTemplate('[locale]:[locale]')
    expect(compiled.keys).toEqual(['locale'])
    expect(compiled.render({ locale: 'x' })).toBe('x:x')
  })

  it('rejects invalid placeholders at compile time', () => {
    expect(() => compileTagTemplate('[locale:bad')).toThrow(/unclosed/)
    expect(() => compileTagTemplate('[]')).toThrow(/invalid placeholder/)
  })

  it('renders a missing param as null, not an inherited property', () => {
    const compiled = compileTagTemplate('[locale]:[constructor]')
    expect(compiled.render({ locale: 'en' })).toBeNull()
  })

  it('keeps long rendered tags stable and within Next.js’s limit', () => {
    const tag = buildTagDefs({ work: '[locale]:work:[slug]' }).work
    const params = { locale: 'en', slug: 'a'.repeat(249) }
    const rendered = tag(params)
    const resolved = resolveTagEntries(tag, params, 'expire')

    expect(rendered).toHaveLength(256)
    expect(resolved[0]?.value).toBe(rendered)
    expect(tag(params)).toBe(rendered)
    expect(tag({ ...params, slug: `${'a'.repeat(248)}b` })).not.toBe(rendered)
  })
})
