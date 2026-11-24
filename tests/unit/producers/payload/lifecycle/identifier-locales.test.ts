import { describe, expect, it } from 'bun:test'
import type { CollectionConfig } from 'payload'

import {
  listPublishedLocalesForDocument,
  readIdentifierAtPath,
  uniqueLocales,
} from '../../../../../src/producers/payload/lifecycle/identifier-field'
import {
  normalizeCollectionRevalidation,
  readRevalidationCustom,
} from '../../../../../src/producers/payload/revalidation-custom'

const localizedProjectsCollection = {
  slug: 'projects',
  fields: [{ name: 'slug', type: 'text', localized: true }],
  versions: { drafts: { localizeStatus: true } },
} as CollectionConfig

describe('readRevalidationCustom enabled', () => {
  it('defaults enabled when omitted', () => {
    expect(normalizeCollectionRevalidation({ identifier: 'slug' }).enabled).toBe(true)
  })

  it('returns null when enabled false', () => {
    expect(readRevalidationCustom({ revalidation: { enabled: false } })).toBeNull()
  })
})

describe('listPublishedLocalesForDocument', () => {
  it('includes only published locales', () => {
    const req = {
      payload: {
        config: {
          localization: {
            locales: [{ code: 'en' }, { code: 'pl' }, { code: 'de' }],
          },
        },
      },
    } as never

    const locales = listPublishedLocalesForDocument({
      req,
      collection: localizedProjectsCollection,
      doc: {
        _status: { en: 'published', pl: 'published', de: 'draft' },
      },
    })

    expect(locales).toEqual(['en', 'pl'])
  })
})

describe('readIdentifierAtPath', () => {
  it('reads localized slug', () => {
    expect(readIdentifierAtPath({ slug: { en: 'a', pl: 'b' } }, 'slug', 'pl', true)).toBe('b')
  })
})

describe('uniqueLocales', () => {
  it('dedupes while preserving order', () => {
    expect(uniqueLocales(['en', 'pl', 'en'])).toEqual(['en', 'pl'])
  })
})
