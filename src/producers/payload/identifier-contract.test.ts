import { describe, expect, it } from 'bun:test'

import {
  normalizeCollectionRevalidation,
  normalizeIdentifiers,
  RevalidationIdentifierError,
} from './revalidation-custom.ts'

describe('normalizeIdentifiers (string | string[] contract)', () => {
  it('treats a single string as one identifier', () => {
    expect(normalizeIdentifiers('slug')).toEqual(['slug'])
    expect(normalizeCollectionRevalidation({ identifier: 'slug' }).identifier).toBe('slug')
  })

  it('treats a missing or blank identifier as none', () => {
    expect(normalizeIdentifiers(undefined)).toEqual([])
    expect(normalizeIdentifiers('   ')).toEqual([])
  })

  it('keeps every entry of an array, in order, trimmed and deduplicated', () => {
    expect(normalizeIdentifiers(['slug', ' externalId ', 'slug'])).toEqual(['slug', 'externalId'])
    expect(normalizeCollectionRevalidation({ identifier: ['slug', 'externalId'] })).toMatchObject({
      identifiers: ['slug', 'externalId'],
      identifier: 'slug',
    })
  })

  it('rejects an empty array, empty entries and non-string entries', () => {
    expect(() => normalizeIdentifiers([])).toThrow(RevalidationIdentifierError)
    expect(() => normalizeIdentifiers(['slug', ''])).toThrow(RevalidationIdentifierError)
    expect(() => normalizeIdentifiers(['slug', 3 as unknown as string])).toThrow(
      RevalidationIdentifierError,
    )
    expect(() => normalizeIdentifiers({ slug: true })).toThrow(RevalidationIdentifierError)
  })
})
