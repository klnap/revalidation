import { describe, expect, it, mock } from 'bun:test'
import { mediaSharedFieldsEqual } from '../lifecycle/helpers.ts'
import { getAtPath, MEDIA_REFERENCES, mediaIdsEqual, resolveMediaId } from './media-references.ts'
import { resolveMediaAffectedLocales } from './resolve-media-affected-locales.ts'
import { resolveMediaDependentChanges } from './resolve-media-dependents.ts'

describe('media-references helpers', () => {
  it('registers all live upload paths', () => {
    expect(MEDIA_REFERENCES).toHaveLength(9)
    expect(MEDIA_REFERENCES.filter((ref) => ref.type === 'collection')).toHaveLength(3)
    expect(MEDIA_REFERENCES.filter((ref) => ref.type === 'global')).toHaveLength(6)
  })

  it('resolves media ids from numbers, strings, and objects', () => {
    expect(resolveMediaId(42)).toBe(42)
    expect(resolveMediaId('42')).toBe('42')
    expect(resolveMediaId({ id: 7 })).toBe(7)
    expect(resolveMediaId(null)).toBe(null)
    expect(resolveMediaId({})).toBe(null)
  })

  it('walks nested paths and compares ids loosely', () => {
    expect(
      getAtPath({ socialMedia: { image: { asset: 9 } } }, ['socialMedia', 'image', 'asset']),
    ).toBe(9)
    expect(getAtPath({ hero: {} }, ['hero', 'image'])).toBeUndefined()
    expect(mediaIdsEqual(9, '9')).toBe(true)
    expect(mediaIdsEqual(9, 10)).toBe(false)
  })
})

describe('mediaSharedFieldsEqual', () => {
  const altExcluded = { excludeFields: ['alt'] as const }

  it('ignores excluded fields and technical keys', () => {
    expect(
      mediaSharedFieldsEqual(
        { id: 1, alt: 'new', url: '/a.jpg', filename: 'a.jpg' },
        { id: 2, alt: 'old', url: '/a.jpg', filename: 'a.jpg' },
        altExcluded,
      ),
    ).toBe(true)
    expect(
      mediaSharedFieldsEqual({ alt: 'x', url: '/a.jpg' }, { alt: 'x', url: '/b.jpg' }, altExcluded),
    ).toBe(false)
  })
})

describe('resolveMediaAffectedLocales', () => {
  const localization = {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'German' },
    ],
  }

  const mediaAltExcluded = {
    mediaSchemaCustom: { revalidation: { excludeFields: ['alt'] } },
  }

  it('returns empty when only excluded name changes', async () => {
    const locales = await resolveMediaAffectedLocales({
      mediaCollectionSlug: 'media',
      mediaId: 1,
      doc: { id: 1, name: 'New label', url: '/a.jpg' },
      previousDoc: { id: 1, name: 'Old label', url: '/a.jpg' },
      mediaSchemaCustom: { revalidation: { excludeFields: ['name'] } },
      req: {
        locale: 'en',
        query: {},
        payload: {
          config: { localization },
          logger: { info: mock(() => {}) },
        },
      } as never,
    })

    expect(locales).toEqual([])
  })

  it('returns empty when single-locale content unchanged', async () => {
    const locales = await resolveMediaAffectedLocales({
      mediaCollectionSlug: 'media',
      mediaId: 1,
      doc: { id: 1, alt: 'Hi', url: '/a.jpg' },
      previousDoc: { id: 1, alt: 'Hi', url: '/a.jpg' },
      ...mediaAltExcluded,
      req: {
        locale: 'en',
        query: {},
        payload: {
          config: { localization },
          logger: { info: mock(() => {}) },
        },
      } as never,
    })

    expect(locales).toEqual([])
  })

  it('scopes to edited locale when only alt changed and alt is not excluded', async () => {
    const locales = await resolveMediaAffectedLocales({
      mediaCollectionSlug: 'media',
      mediaId: 1,
      doc: { id: 1, alt: 'New', url: '/a.jpg' },
      previousDoc: { id: 1, alt: 'Old', url: '/a.jpg' },
      req: {
        locale: 'en',
        query: {},
        payload: {
          config: { localization },
          logger: { info: mock(() => {}) },
        },
      } as never,
    })

    expect(locales).toEqual(['en'])
  })

  it('skips parent revalidation when only excluded alt changes', async () => {
    const locales = await resolveMediaAffectedLocales({
      mediaCollectionSlug: 'media',
      mediaId: 1,
      doc: { id: 1, alt: 'New', url: '/a.jpg' },
      previousDoc: { id: 1, alt: 'Old', url: '/a.jpg' },
      ...mediaAltExcluded,
      req: {
        locale: 'en',
        query: {},
        payload: {
          config: { localization },
          logger: { info: mock(() => {}) },
        },
      } as never,
    })

    expect(locales).toEqual([])
  })

  it('fans out to all locales when shared fields change', async () => {
    const locales = await resolveMediaAffectedLocales({
      mediaCollectionSlug: 'media',
      mediaId: 1,
      doc: { id: 1, alt: 'Same', url: '/new.jpg' },
      previousDoc: { id: 1, alt: 'Same', url: '/old.jpg' },
      ...mediaAltExcluded,
      req: {
        locale: 'en',
        query: {},
        payload: {
          config: { localization },
          logger: { info: mock(() => {}) },
        },
      } as never,
    })

    expect(locales).toEqual(['en', 'de'])
  })

  describe('Sanity-style alt map (payload-storage-sanity API shape)', () => {
    const plEnDe = {
      locales: [
        { code: 'pl', label: 'Polish' },
        { code: 'en', label: 'English' },
        { code: 'de', label: 'German' },
      ],
    }

    const reqPlTab = {
      locale: 'pl',
      query: { locale: 'pl', publishSpecificLocale: 'pl' },
      payload: {
        config: { localization: plEnDe },
        logger: { info: mock(() => {}) },
      },
    } as never

    it('scopes to pl when only alt.pl changes and alt is not excluded', async () => {
      const locales = await resolveMediaAffectedLocales({
        mediaCollectionSlug: 'media',
        mediaId: 'media-1',
        doc: {
          id: 'media-1',
          url: '/a.jpg',
          alt: { pl: 'new-pl', en: 'en-alt', de: 'de-alt' },
        },
        previousDoc: {
          id: 'media-1',
          url: '/a.jpg',
          alt: { pl: 'old-pl', en: 'en-alt', de: 'de-alt' },
        },
        req: reqPlTab,
      })

      expect(locales).toEqual(['pl'])
    })

    it('skips when alt is excluded on media schema', async () => {
      const locales = await resolveMediaAffectedLocales({
        mediaCollectionSlug: 'media',
        mediaId: 'media-1',
        doc: {
          id: 'media-1',
          url: '/a.jpg',
          alt: { pl: 'new-pl', en: 'en-alt', de: 'de-alt' },
        },
        previousDoc: {
          id: 'media-1',
          url: '/a.jpg',
          alt: { pl: 'old-pl', en: 'en-alt', de: 'de-alt' },
        },
        mediaSchemaCustom: { revalidation: { excludeFields: ['alt'] } },
        req: reqPlTab,
      })

      expect(locales).toEqual([])
    })

    it('does not treat alt map-only diff as shared file change', async () => {
      expect(
        mediaSharedFieldsEqual(
          { url: '/a.jpg', alt: { pl: 'a', en: 'b', de: 'c' } },
          { url: '/a.jpg', alt: { pl: 'x', en: 'b', de: 'c' } },
          { excludeFields: ['alt'] },
        ),
      ).toBe(true)
    })

    it('fans out to all site locales when url changes alongside alt map', async () => {
      const locales = await resolveMediaAffectedLocales({
        mediaCollectionSlug: 'media',
        mediaId: 'media-1',
        doc: {
          id: 'media-1',
          url: '/new.jpg',
          alt: { pl: 'pl', en: 'en', de: 'de' },
        },
        previousDoc: {
          id: 'media-1',
          url: '/old.jpg',
          alt: { pl: 'pl', en: 'en', de: 'de' },
        },
        mediaSchemaCustom: { revalidation: { excludeFields: ['alt'] } },
        req: reqPlTab,
      })

      expect(locales).toEqual(['pl', 'en', 'de'])
    })
  })
})

describe('resolveMediaDependentChanges', () => {
  it('builds parent changes for matching collections and globals', async () => {
    const find = mock(() =>
      Promise.resolve({
        docs: [
          { id: 1, slug: 'tower', title: 'Tower', _status: 'published' },
          { id: 2, slug: 'drafty', title: 'Draft', _status: 'draft' },
        ],
      }),
    )
    const findGlobal = mock(({ slug }: { slug: string }) => {
      if (slug === 'work-page') {
        return Promise.resolve({
          id: 1,
          socialMedia: { image: { asset: 99 } },
          title: 'Projects',
        })
      }
      if (slug === 'home-page') {
        return Promise.resolve({
          id: 1,
          socialMedia: { image: { asset: 99 } },
          title: 'Home',
        })
      }
      return Promise.resolve({ id: 1, socialMedia: { image: { asset: 1 } } })
    })

    const changes = await resolveMediaDependentChanges({
      mediaId: 99,
      locales: ['en'],
      payload: { find, findGlobal } as never,
    })

    expect(find).toHaveBeenCalled()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'collection',
          slug: 'projects',
          locale: 'en',
          doc: expect.objectContaining({ slug: 'tower' }),
        }),
        expect.objectContaining({
          type: 'global',
          slug: 'work-page',
          locale: 'en',
        }),
        expect.objectContaining({
          type: 'global',
          slug: 'home-page',
          locale: 'en',
        }),
      ]),
    )
    expect(changes.some((c) => c.doc.slug === 'drafty')).toBe(false)
    expect(changes.some((c) => c.slug === 'about-page' || c.slug === 'privacy-policy-page')).toBe(
      false,
    )
  })

  it('returns empty when no locales', async () => {
    const changes = await resolveMediaDependentChanges({
      mediaId: 1,
      locales: [],
      payload: { find: mock(), findGlobal: mock() } as never,
    })

    expect(changes).toEqual([])
  })

  it('includes published collection dependents for image', async () => {
    const heroMediaId = 42
    const find = mock(({ where }: { where?: Record<string, { equals: number }> }) => {
      const path = Object.keys(where ?? {})[0]
      if (path === 'image') {
        return Promise.resolve({
          docs: [{ id: 'p1', slug: 'alpha', _status: 'published', title: 'Alpha' }],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const changes = await resolveMediaDependentChanges({
      mediaId: heroMediaId,
      locales: ['pl'],
      payload: { find, findGlobal: mock() } as never,
    })

    expect(changes).toEqual([
      expect.objectContaining({
        type: 'collection',
        slug: 'projects',
        locale: 'pl',
        doc: expect.objectContaining({ slug: 'alpha' }),
      }),
    ])
    expect(find).toHaveBeenCalled()
  })

  it('uses in operator for hasMany gallery registry path', async () => {
    const find = mock<
      (args: { where?: Record<string, { in?: number[]; equals?: number }> }) => Promise<{
        docs: never[]
      }>
    >(() => Promise.resolve({ docs: [] }))

    await resolveMediaDependentChanges({
      mediaId: 77,
      locales: ['en'],
      payload: { find, findGlobal: mock() } as never,
    })

    const galleryCall = find.mock.calls.find(([args]) => args?.where && 'gallery' in args.where)
    expect(galleryCall?.[0]?.where?.gallery).toEqual({ in: [77] })
  })

  it('dedupes parent when image and gallery refs match same document', async () => {
    const doc = { id: 'same', slug: 'one', _status: 'published' }
    const find = mock(
      ({ where }: { where?: Record<string, { equals?: number; in?: number[] }> }) => {
        const path = Object.keys(where ?? {})[0]
        if (path === 'image' || path === 'gallery') {
          return Promise.resolve({ docs: [doc] })
        }
        return Promise.resolve({ docs: [] })
      },
    )

    const changes = await resolveMediaDependentChanges({
      mediaId: 5,
      locales: ['pl'],
      payload: { find, findGlobal: mock() } as never,
    })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ type: 'collection', slug: 'projects', locale: 'pl' })
  })
})
