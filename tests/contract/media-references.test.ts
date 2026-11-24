import { describe, expect, it } from 'bun:test'

import {
  type CollectionMediaRef,
  type GlobalMediaRef,
  MEDIA_REFERENCES,
} from '../../src/producers/payload/media/media-references'

/**
 * Shipped registry contract — keep aligned with
 * `specs/media-dependent-revalidation.md` § Shipped registry and `MEDIA_REFERENCES`.
 */
const DOCUMENTED_COLLECTION_PATHS: Array<
  Pick<CollectionMediaRef, 'slug' | 'wherePath' | 'hasMany'>
> = [
  { slug: 'projects', wherePath: 'image' },
  { slug: 'projects', wherePath: 'gallery', hasMany: true },
  { slug: 'projects', wherePath: 'socialMedia.image.asset' },
]

const DOCUMENTED_GLOBAL_PATHS: Array<Pick<GlobalMediaRef, 'slug' | 'path'>> = [
  { slug: 'home-page', path: ['socialMedia', 'image', 'asset'] },
  { slug: 'about-page', path: ['socialMedia', 'image', 'asset'] },
  { slug: 'privacy-policy-page', path: ['socialMedia', 'image', 'asset'] },
  { slug: 'work-page', path: ['socialMedia', 'image', 'asset'] },
  { slug: 'contact-page', path: ['image'] },
  { slug: 'contact-page', path: ['socialMedia', 'image', 'asset'] },
]

describe('MEDIA_REFERENCES contract', () => {
  it('matches documented collection upload paths', () => {
    const collectionRefs = MEDIA_REFERENCES.filter(
      (ref): ref is CollectionMediaRef => ref.type === 'collection',
    )

    for (const expected of DOCUMENTED_COLLECTION_PATHS) {
      const match = collectionRefs.find(
        (ref) => ref.slug === expected.slug && ref.wherePath === expected.wherePath,
      )
      expect(match).toBeDefined()
      expect(Boolean(match?.hasMany)).toBe(Boolean(expected.hasMany))
    }

    expect(collectionRefs).toHaveLength(DOCUMENTED_COLLECTION_PATHS.length)
  })

  it('matches documented global upload paths', () => {
    const globalRefs = MEDIA_REFERENCES.filter(
      (ref): ref is GlobalMediaRef => ref.type === 'global',
    )

    for (const expected of DOCUMENTED_GLOBAL_PATHS) {
      const match = globalRefs.find(
        (ref) => ref.slug === expected.slug && ref.path.join('.') === expected.path.join('.'),
      )
      expect(match).toBeDefined()
    }

    expect(globalRefs).toHaveLength(DOCUMENTED_GLOBAL_PATHS.length)
  })

  it('does not register fixture-only paths absent from the documented registry', () => {
    const collectionPaths = MEDIA_REFERENCES.filter((ref) => ref.type === 'collection').map(
      (ref) => ref.wherePath,
    )
    expect(collectionPaths).not.toContain('localeImage')
  })
})
