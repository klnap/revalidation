import { describe, expect, test } from 'bun:test'
import type { CollectionConfig } from 'payload'
import { collectionHasUpload, resolveMediaSlug } from './resolve-media-slug.ts'

const Media = { slug: 'media', upload: true } as CollectionConfig
const Files = { slug: 'files', upload: { staticDir: 'files' } } as CollectionConfig
const Posts = { slug: 'posts' } as CollectionConfig

describe('resolveMediaSlug', () => {
  test('uses explicit media collection slug', () => {
    expect(resolveMediaSlug({ collections: [Posts, Media] }, Media)).toBe('media')
  })

  test('auto-detects sole upload collection', () => {
    expect(resolveMediaSlug({ collections: [Posts, Media] })).toBe('media')
  })

  test('prefers slug media when multiple uploads', () => {
    expect(resolveMediaSlug({ collections: [Media, Files] })).toBe('media')
  })

  test('returns undefined when multiple uploads and no media slug', () => {
    expect(
      resolveMediaSlug({
        collections: [
          { slug: 'assets', upload: true } as CollectionConfig,
          { slug: 'files', upload: true } as CollectionConfig,
        ],
      }),
    ).toBeUndefined()
  })

  test('returns undefined when no upload collections', () => {
    expect(resolveMediaSlug({ collections: [Posts] })).toBeUndefined()
  })
})

describe('collectionHasUpload', () => {
  test('detects boolean and object upload config', () => {
    expect(collectionHasUpload({ slug: 'a', upload: true } as CollectionConfig)).toBe(true)
    expect(collectionHasUpload({ slug: 'b', upload: { staticDir: 'x' } } as CollectionConfig)).toBe(
      true,
    )
    expect(collectionHasUpload(Posts)).toBe(false)
  })
})
