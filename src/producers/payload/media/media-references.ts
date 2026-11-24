import type { Field, SanitizedConfig } from 'payload'

import { readRevalidationCustom } from '../revalidation-custom.js'

export type CollectionMediaRef = {
  type: 'collection'
  slug: string
  /** Payload `where` key, dot-separated through groups and arrays (for example `seo.image`). */
  wherePath: string
  hasDrafts: boolean
  /** Upload field stores multiple media IDs when true (`where` uses `in`). */
  hasMany?: boolean
}

export type GlobalMediaRef = {
  type: 'global'
  slug: string
  /** Keys from the global root to the upload field. */
  path: string[]
}

export type MediaReference = CollectionMediaRef | GlobalMediaRef

type Found = { path: string[]; hasMany: boolean; throughArray: boolean }

/**
 * Walks fields and collects upload/relationship fields that point only at `mediaSlug`.
 * Rows, collapsibles, tabs and named groups are transparent; arrays add a path segment.
 * Blocks and polymorphic relationships are not followed.
 */
const collectMediaFields = (
  fields: readonly Field[],
  mediaSlug: string,
  prefix: string[] = [],
  throughArray = false,
): Found[] => {
  const found: Found[] = []
  for (const field of fields) {
    const name = 'name' in field && typeof field.name === 'string' ? field.name : undefined
    switch (field.type) {
      case 'row':
      case 'collapsible':
        found.push(...collectMediaFields(field.fields, mediaSlug, prefix, throughArray))
        break
      case 'tabs':
        for (const tab of field.tabs) {
          const tabName = 'name' in tab && typeof tab.name === 'string' ? tab.name : undefined
          found.push(
            ...collectMediaFields(
              tab.fields,
              mediaSlug,
              tabName ? [...prefix, tabName] : prefix,
              throughArray,
            ),
          )
        }
        break
      case 'group':
        found.push(
          ...collectMediaFields(
            field.fields,
            mediaSlug,
            name ? [...prefix, name] : prefix,
            throughArray,
          ),
        )
        break
      case 'array':
        if (name) {
          found.push(...collectMediaFields(field.fields, mediaSlug, [...prefix, name], true))
        }
        break
      case 'upload':
      case 'relationship':
        if (name && field.relationTo === mediaSlug) {
          found.push({
            path: [...prefix, name],
            hasMany: 'hasMany' in field && field.hasMany === true,
            throughArray,
          })
        }
        break
      default:
        break
    }
  }
  return found
}

const configCache = new WeakMap<object, Map<string, MediaReference[]>>()

/**
 * Finds the collections and globals that reference `mediaSlug` through upload fields.
 * Only entities that opted in with `custom.revalidation` are included. Derived from the
 * sanitized Payload config, so no registry has to be maintained by hand.
 */
export const discoverMediaReferences = (
  config: Pick<SanitizedConfig, 'collections' | 'globals'>,
  mediaSlug: string,
): MediaReference[] => {
  const cached = configCache.get(config)?.get(mediaSlug)
  if (cached) return cached

  const refs: MediaReference[] = []
  for (const collection of config.collections) {
    if (collection.slug === mediaSlug || !readRevalidationCustom(collection.custom)) continue
    const hasDrafts = Boolean(collection.versions?.drafts)
    for (const hit of collectMediaFields(collection.fields, mediaSlug)) {
      refs.push({
        type: 'collection',
        slug: collection.slug,
        wherePath: hit.path.join('.'),
        hasDrafts,
        ...(hit.hasMany ? { hasMany: true } : {}),
      })
    }
  }
  for (const global of config.globals) {
    if (!readRevalidationCustom(global.custom)) continue
    // Values inside arrays cannot be addressed by a plain path, so globals skip them.
    for (const hit of collectMediaFields(global.fields, mediaSlug)) {
      if (hit.throughArray || hit.hasMany) continue
      refs.push({ type: 'global', slug: global.slug, path: hit.path })
    }
  }

  const perConfig = configCache.get(config) ?? new Map<string, MediaReference[]>()
  perConfig.set(mediaSlug, refs)
  configCache.set(config, perConfig)
  return refs
}

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
