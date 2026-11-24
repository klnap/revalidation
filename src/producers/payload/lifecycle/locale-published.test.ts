import { describe, expect, it } from 'bun:test'

import {
  hasLocalizedDraftStatus,
  isLocalePublished,
  isLocaleUnpublished,
} from './locale-published.ts'

describe('hasLocalizedDraftStatus', () => {
  it('is true for collection and global drafts.localizeStatus', () => {
    expect(
      hasLocalizedDraftStatus({
        versions: { drafts: { localizeStatus: true } },
      }),
    ).toBe(true)
    expect(hasLocalizedDraftStatus({ versions: { drafts: true } })).toBe(false)
    expect(hasLocalizedDraftStatus({})).toBe(false)
  })
})

describe('isLocalePublished', () => {
  it('reads string _status (localizeStatus off)', () => {
    expect(isLocalePublished('published', 'en', false)).toBe(true)
    expect(isLocalePublished('draft', 'en', false)).toBe(false)
  })

  it('reads per-locale map (localizeStatus on)', () => {
    const map = { pl: 'published', en: 'draft', de: 'published' }
    expect(isLocalePublished(map, 'pl', true)).toBe(true)
    expect(isLocalePublished(map, 'en', true)).toBe(false)
    expect(isLocaleUnpublished(map, 'en', true)).toBe(true)
  })

  it('treats resolved published string as published even when localizeStatus is on', () => {
    expect(isLocalePublished('published', 'de', true)).toBe(true)
  })
})
