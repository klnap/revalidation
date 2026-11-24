/**
 * Explicit registry of upload fields that reference the `media` collection.
 * Add a row when a new media upload field ships.
 */

export type CollectionMediaRef = {
  type: 'collection'
  slug: 'projects'
  wherePath: string
  hasDrafts: boolean
  /** Upload field stores multiple media IDs when true (`where` uses `in`). */
  hasMany?: boolean
}

export type GlobalMediaRef = {
  type: 'global'
  slug: 'home-page' | 'about-page' | 'privacy-policy-page' | 'work-page' | 'contact-page'
  path: string[]
}

export type MediaReference = CollectionMediaRef | GlobalMediaRef

export const MEDIA_REFERENCES: MediaReference[] = [
  {
    type: 'collection',
    slug: 'projects',
    wherePath: 'image',
    hasDrafts: true,
  },
  {
    type: 'collection',
    slug: 'projects',
    wherePath: 'gallery',
    hasDrafts: true,
    hasMany: true,
  },
  {
    type: 'collection',
    slug: 'projects',
    wherePath: 'socialMedia.image.asset',
    hasDrafts: true,
  },
  {
    type: 'global',
    slug: 'home-page',
    path: ['socialMedia', 'image', 'asset'],
  },
  {
    type: 'global',
    slug: 'about-page',
    path: ['socialMedia', 'image', 'asset'],
  },
  {
    type: 'global',
    slug: 'privacy-policy-page',
    path: ['socialMedia', 'image', 'asset'],
  },
  {
    type: 'global',
    slug: 'work-page',
    path: ['socialMedia', 'image', 'asset'],
  },
  {
    type: 'global',
    slug: 'contact-page',
    path: ['image'],
  },
  {
    type: 'global',
    slug: 'contact-page',
    path: ['socialMedia', 'image', 'asset'],
  },
]

export const resolveMediaId = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}

export const getAtPath = (doc: Record<string, unknown>, path: string[]): unknown => {
  let current: unknown = doc
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export const mediaIdsEqual = (a: number | string, b: number | string): boolean =>
  String(a) === String(b)
