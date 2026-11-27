import { describe, expect, it } from 'bun:test'

import { compileTagTemplate } from './compile-tag-template.ts'
import { buildPathDefs, buildTagDefs } from './registry-builders.ts'

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

    expect(rendered).toHaveLength(256)
    expect(tag(params)).toBe(rendered)
    expect(tag({ ...params, slug: `${'a'.repeat(248)}b` })).not.toBe(rendered)
  })

  it('keeps path placeholders within one safe URL segment', () => {
    const path = buildPathDefs({ project: '/[locale]/work/[slug]' }).project

    expect(path({ locale: 'pl', slug: 'example%20project' })).toBe('/pl/work/example%20project')
    expect(() => path({ locale: 'pl', slug: '..' })).toThrow(/dot segment/)
    expect(() => path({ locale: 'pl', slug: '../admin' })).toThrow(/path separator/)
    expect(() => path({ locale: 'pl', slug: 'a%2Fb' })).toThrow(/path separator/)
    expect(() => path({ locale: 'pl', slug: 'a%ZZ' })).toThrow(/percent encoding/)
    expect(() => path({ locale: 'pl', slug: 'a?secret=1' })).toThrow(/delimiter/)
  })

  it('requires path templates to be absolute and within Next.js path limits', () => {
    expect(() => buildPathDefs({ project: 'projects/[slug]' })).toThrow(/start with "\/"/)
    expect(() => buildPathDefs({ project: `/${'a'.repeat(1024)}` })).toThrow(/1024 characters/)
  })
})
