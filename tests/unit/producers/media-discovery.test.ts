import { describe, expect, it } from 'bun:test'

import { discoverMediaReferences } from '../../../src/producers/payload/media/media-references'

const upload = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  type: 'upload',
  relationTo: 'media',
  ...extra,
})
const optedIn = { revalidation: true }

const config = {
  collections: [
    { slug: 'media', custom: optedIn, fields: [upload('self')] },
    {
      slug: 'posts',
      custom: optedIn,
      versions: { drafts: true },
      fields: [
        upload('hero'),
        upload('gallery', { hasMany: true }),
        { type: 'row', fields: [upload('thumb')] },
        { name: 'seo', type: 'group', fields: [upload('og')] },
        {
          type: 'tabs',
          tabs: [{ name: 'extra', fields: [upload('banner')] }, { fields: [upload('loose')] }],
        },
        { name: 'slides', type: 'array', fields: [upload('image')] },
        { name: 'layout', type: 'blocks', blocks: [{ slug: 'b', fields: [upload('image')] }] },
        { name: 'either', type: 'upload', relationTo: ['media', 'files'] },
        { name: 'other', type: 'upload', relationTo: 'files' },
      ],
    },
    { slug: 'pages', fields: [upload('hero')] },
    { slug: 'off', custom: { revalidation: { enabled: false } }, fields: [upload('hero')] },
  ],
  globals: [
    {
      slug: 'home',
      custom: optedIn,
      fields: [
        { name: 'seo', type: 'group', fields: [upload('og')] },
        upload('multi', { hasMany: true }),
        { name: 'items', type: 'array', fields: [upload('image')] },
      ],
    },
    { slug: 'footer', fields: [upload('logo')] },
  ],
} as never

describe('discoverMediaReferences', () => {
  const refs = discoverMediaReferences(config, 'media')
  const collectionPaths = refs
    .filter((r) => r.type === 'collection')
    .map((r) => r.type === 'collection' && `${r.slug}:${r.wherePath}`)
  const globalPaths = refs
    .filter((r) => r.type === 'global')
    .map((r) => r.type === 'global' && `${r.slug}:${r.path.join('.')}`)

  it('finds upload fields through rows, groups, named tabs and arrays', () => {
    expect(collectionPaths).toEqual([
      'posts:hero',
      'posts:gallery',
      'posts:thumb',
      'posts:seo.og',
      'posts:extra.banner',
      'posts:loose',
      'posts:slides.image',
    ])
  })

  it('marks hasMany and drafts from the field and collection config', () => {
    const gallery = refs.find((r) => r.type === 'collection' && r.wherePath === 'gallery')
    expect(gallery).toMatchObject({ hasMany: true, hasDrafts: true })
  })

  it('skips the media collection, blocks, polymorphic fields and other targets', () => {
    expect(collectionPaths.join()).not.toMatch(/self|layout|either|other/)
  })

  it('includes only collections and globals that opted in', () => {
    expect(collectionPaths.join()).not.toMatch(/pages:|off:/)
    expect(globalPaths).toEqual(['home:seo.og'])
  })

  it('skips hasMany and array fields in globals', () => {
    expect(globalPaths.join()).not.toMatch(/multi|items/)
  })
})
