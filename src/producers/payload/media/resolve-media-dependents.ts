import type { Payload } from 'payload'

import { hasLocaleData, type RevalidationChange, toTypedLocale } from '../lifecycle/helpers.js'
import {
  type CollectionMediaRef,
  discoverMediaReferences,
  type GlobalMediaRef,
  getAtPath,
  mediaIdsEqual,
  resolveMediaId,
} from './media-references.js'

type ResolveArgs = {
  mediaId: number | string
  mediaSlug: string
  payload: Payload
  locales: string[]
  operation?: RevalidationChange['operation']
}

const DEPENDENT_PAGE_SIZE = 500

const changeKey = (change: RevalidationChange): string => {
  const id = change.doc.id
  const documentId = typeof id === 'string' || typeof id === 'number' ? String(id) : ''
  return `${change.type}:${change.slug}:${change.locale}:${documentId}`
}

const mediaIdWhere = (ref: CollectionMediaRef, mediaId: number | string) => {
  const leaf = ref.hasMany ? { in: [mediaId] } : { equals: mediaId }
  return { [ref.wherePath]: leaf }
}

export const resolveCollectionDependents = async ({
  ref,
  mediaId,
  payload,
  locales,
  operation,
}: {
  ref: CollectionMediaRef
  mediaId: number | string
  payload: Payload
  locales: string[]
  operation: RevalidationChange['operation']
}): Promise<RevalidationChange[]> => {
  const changes: RevalidationChange[] = []

  for (const locale of locales) {
    // Every page is read: a fixed page cap would silently drop dependents from invalidation.
    let page = 1
    for (;;) {
      const result = await payload.find({
        collection: ref.slug,
        where: mediaIdWhere(ref, mediaId),
        locale: toTypedLocale(locale),
        fallbackLocale: false,
        depth: 0,
        draft: false,
        overrideAccess: true,
        limit: DEPENDENT_PAGE_SIZE,
        page,
        pagination: true,
      })

      for (const doc of result.docs) {
        const localeDoc = doc as Record<string, unknown>
        if (!hasLocaleData(localeDoc)) continue
        if (ref.hasDrafts && operation !== 'delete' && localeDoc._status !== 'published') {
          continue
        }

        changes.push({
          type: 'collection',
          slug: ref.slug,
          operation,
          locale,
          doc: localeDoc,
        })
      }

      if (!result.hasNextPage) break
      page += 1
    }
  }

  return changes
}

const resolveGlobalDependents = async ({
  ref,
  mediaId,
  payload,
  locales,
  operation,
}: {
  ref: GlobalMediaRef
  mediaId: number | string
  payload: Payload
  locales: string[]
  operation: RevalidationChange['operation']
}): Promise<RevalidationChange[]> => {
  const changes: RevalidationChange[] = []

  for (const locale of locales) {
    const globalDoc = (await payload.findGlobal({
      slug: ref.slug,
      locale: toTypedLocale(locale),
      fallbackLocale: false,
      depth: 0,
      draft: false,
      overrideAccess: true,
    })) as Record<string, unknown>

    const fieldValue = getAtPath(globalDoc, ref.path)
    const fieldMediaId = resolveMediaId(fieldValue)
    if (fieldMediaId === null || !mediaIdsEqual(fieldMediaId, mediaId)) {
      continue
    }

    if (!hasLocaleData(globalDoc)) continue

    changes.push({
      type: 'global',
      slug: ref.slug,
      operation,
      locale,
      doc: globalDoc,
    })
  }

  return changes
}

/**
 * Find all published parents that reference `mediaId` and build
 * RevalidationChange entries shaped like a parent update/delete.
 */
export const resolveMediaDependentChanges = async ({
  mediaId,
  mediaSlug,
  payload,
  locales,
  operation = 'update',
}: ResolveArgs): Promise<RevalidationChange[]> => {
  if (!locales.length) return []

  const batches = await Promise.all(
    discoverMediaReferences(payload.config, mediaSlug).map((ref) => {
      if (ref.type === 'collection') {
        return resolveCollectionDependents({
          ref,
          mediaId,
          payload,
          locales,
          operation,
        })
      }
      return resolveGlobalDependents({
        ref,
        mediaId,
        payload,
        locales,
        operation,
      })
    }),
  )

  const seen = new Set<string>()
  const changes: RevalidationChange[] = []

  for (const batch of batches) {
    for (const change of batch) {
      const key = changeKey(change)
      if (seen.has(key)) continue
      seen.add(key)
      changes.push(change)
    }
  }

  return changes
}
