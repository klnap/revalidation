import { describe, expect, it } from 'bun:test'

import {
  normalizeExcludeFields,
  RevalidationExcludeFieldsError,
  readRevalidationExcludeFields,
  resolveExcludeFields,
} from './exclude-fields.ts'
import { omitFieldPaths } from './lifecycle/doc-content.ts'

describe('readRevalidationExcludeFields', () => {
  it('returns undefined when excludeFields omitted', () => {
    expect(readRevalidationExcludeFields({ revalidation: true })).toBeUndefined()
    expect(readRevalidationExcludeFields({ revalidation: { identifier: 'slug' } })).toBeUndefined()
  })

  it('returns explicit list including empty array', () => {
    expect(readRevalidationExcludeFields({ revalidation: { excludeFields: [] } })).toEqual([])
    expect(
      readRevalidationExcludeFields({ revalidation: { excludeFields: ['description'] } }),
    ).toEqual(['description'])
  })

  it('reads excludeFields when enabled is false (media dependents)', () => {
    expect(
      readRevalidationExcludeFields({
        revalidation: { enabled: false, excludeFields: ['name', 'alt'] },
      }),
    ).toEqual(['name', 'alt'])
  })
})

describe('resolveExcludeFields', () => {
  it('uses plugin defaults when schema omits excludeFields', () => {
    expect(
      resolveExcludeFields({
        schemaCustom: { revalidation: true },
        pluginExcludeFields: ['name'],
      }),
    ).toEqual(['name'])
  })

  it('replaces plugin list when schema sets excludeFields', () => {
    expect(
      resolveExcludeFields({
        schemaCustom: { revalidation: { excludeFields: ['description'] } },
        pluginExcludeFields: ['name'],
        pluginCollectionExcludeFields: { redirects: ['description'] },
        collectionSlug: 'redirects',
      }),
    ).toEqual(['description'])
  })

  it('uses plugin per-collection list before global plugin default', () => {
    expect(
      resolveExcludeFields({
        schemaCustom: { revalidation: true },
        collectionSlug: 'redirects',
        pluginCollectionExcludeFields: { redirects: ['description'] },
        pluginExcludeFields: ['name'],
      }),
    ).toEqual(['description'])
  })

  it('CMS collection list wins over plugin per-collection', () => {
    expect(
      resolveExcludeFields({
        schemaCustom: { revalidation: { excludeFields: ['from'] } },
        collectionSlug: 'redirects',
        pluginCollectionExcludeFields: { redirects: ['description'] },
        pluginExcludeFields: ['name'],
      }),
    ).toEqual(['from'])
  })

  it('uses plugin per-global before global default', () => {
    expect(
      resolveExcludeFields({
        schemaCustom: { revalidation: true },
        globalSlug: 'home-page',
        pluginGlobalExcludeFields: { 'home-page': ['internalNote'] },
        pluginExcludeFields: ['name'],
      }),
    ).toEqual(['internalNote'])
  })

  it('prefers media schema over plugin for dependents', () => {
    expect(
      resolveExcludeFields({
        isMediaDependent: true,
        mediaSchemaCustom: { revalidation: { excludeFields: ['name'] } },
        pluginExcludeFields: ['description'],
        mediaPluginExcludeFields: ['alt'],
      }),
    ).toEqual(['name'])
  })

  it('falls back to media plugin then global plugin for dependents', () => {
    expect(
      resolveExcludeFields({
        isMediaDependent: true,
        mediaPluginExcludeFields: ['alt'],
        pluginExcludeFields: ['name'],
      }),
    ).toEqual(['alt'])
  })
})

describe('normalizeExcludeFields', () => {
  it('throws when identifier is listed in excludeFields', () => {
    expect(() => normalizeExcludeFields(['slug', 'title'], { identifiers: ['slug'] })).toThrow(
      RevalidationExcludeFieldsError,
    )
  })

  it('throws when any of several identifiers is listed in excludeFields', () => {
    expect(() =>
      normalizeExcludeFields(['externalId'], { identifiers: ['slug', 'externalId'] }),
    ).toThrow(RevalidationExcludeFieldsError)
  })
})

describe('omitFieldPaths', () => {
  it('removes nested paths', () => {
    const doc = { title: 'A', seo: { internalNote: 'x', title: 'SEO' } }
    expect(omitFieldPaths(doc, ['seo.internalNote'])).toEqual({
      title: 'A',
      seo: { title: 'SEO' },
    })
  })
})
