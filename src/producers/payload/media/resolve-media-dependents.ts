import type { Payload, PayloadRequest } from 'payload'

import {
  hasLocaleData,
  type RevalidationChange,
  readCollectionIdentity,
  toTypedLocale,
} from '../lifecycle/helpers.js'
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
  req: PayloadRequest
  locales: string[]
  operation?: RevalidationChange['operation']
}

export type MediaDependencyFailure = {
  refSlug: string
  locale?: string
  error: unknown
}

export type MediaDependencyResolution = {
  complete: boolean
  changes: RevalidationChange[]
  failures: MediaDependencyFailure[]
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
  req,
  locales,
  operation,
}: {
  ref: CollectionMediaRef
  mediaId: number | string
  payload: Payload
  req: PayloadRequest
  locales: string[]
  operation: RevalidationChange['operation']
}): Promise<MediaDependencyResolution> => {
  const changes: RevalidationChange[] = []
  const failures: MediaDependencyFailure[] = []

  for (const locale of locales) {
    try {
      // Every page is read: a fixed page cap would silently drop dependents from invalidation.
      let cursor: string | number | undefined
      for (;;) {
        const dependencyWhere = mediaIdWhere(ref, mediaId)
        const result = await payload.find({
          collection: ref.slug,
          where:
            cursor === undefined
              ? dependencyWhere
              : { and: [dependencyWhere, { id: { greater_than: cursor } }] },
          locale: toTypedLocale(locale),
          fallbackLocale: false,
          depth: 0,
          draft: false,
          overrideAccess: true,
          limit: DEPENDENT_PAGE_SIZE,
          page: 1,
          pagination: true,
          sort: 'id',
          req,
        })

        for (const doc of result.docs) {
          const localeDoc = doc as Record<string, unknown>
          if (!hasLocaleData(localeDoc)) continue
          if (ref.hasDrafts && operation !== 'delete' && localeDoc._status !== 'published') {
            continue
          }

          const collection = payload.collections?.[ref.slug]?.config
          const identity = collection
            ? readCollectionIdentity({ collection, locale, doc: localeDoc })
            : {}
          changes.push({
            type: 'collection',
            slug: ref.slug,
            operation,
            locale,
            doc: localeDoc,
            ...(identity.routeSlug !== undefined ? { routeSlug: identity.routeSlug } : {}),
            ...(identity.identifiers ? { identifiers: identity.identifiers } : {}),
          })
        }

        if (!result.hasNextPage) break
        const lastId = result.docs.at(-1)?.id
        if (
          (typeof lastId !== 'string' && typeof lastId !== 'number') ||
          (cursor !== undefined && (typeof lastId !== typeof cursor || lastId <= cursor))
        ) {
          throw new Error(`Payload dependency pagination did not advance for ${ref.slug}`)
        }
        cursor = lastId
      }
    } catch (error) {
      failures.push({ refSlug: ref.slug, locale, error })
    }
  }

  return { complete: failures.length === 0, changes, failures }
}

const resolveGlobalDependents = async ({
  ref,
  mediaId,
  payload,
  req,
  locales,
  operation,
}: {
  ref: GlobalMediaRef
  mediaId: number | string
  payload: Payload
  req: PayloadRequest
  locales: string[]
  operation: RevalidationChange['operation']
}): Promise<MediaDependencyResolution> => {
  const changes: RevalidationChange[] = []
  const failures: MediaDependencyFailure[] = []

  for (const locale of locales) {
    try {
      const globalDoc = (await payload.findGlobal({
        slug: ref.slug,
        locale: toTypedLocale(locale),
        fallbackLocale: false,
        depth: 0,
        draft: false,
        overrideAccess: true,
        req,
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
    } catch (error) {
      failures.push({ refSlug: ref.slug, locale, error })
    }
  }

  return { complete: failures.length === 0, changes, failures }
}

/**
 * Find all published parents that reference `mediaId` and build
 * RevalidationChange entries shaped like a parent update/delete.
 */
export const resolveMediaDependentChanges = async ({
  mediaId,
  mediaSlug,
  payload,
  req,
  locales,
  operation = 'update',
}: ResolveArgs): Promise<MediaDependencyResolution> => {
  if (!locales.length) return { complete: true, changes: [], failures: [] }

  const refs = discoverMediaReferences(payload.config, mediaSlug)
  const settledBatches = await Promise.allSettled(
    refs.map((ref) => {
      if (ref.type === 'collection') {
        return resolveCollectionDependents({
          ref,
          mediaId,
          payload,
          req,
          locales,
          operation,
        })
      }
      return resolveGlobalDependents({
        ref,
        mediaId,
        payload,
        req,
        locales,
        operation,
      })
    }),
  )

  const seen = new Set<string>()
  const changes: RevalidationChange[] = []
  const failures: MediaDependencyFailure[] = []

  for (const [index, result] of settledBatches.entries()) {
    if (result.status === 'rejected') {
      const ref = refs[index]
      failures.push({ refSlug: ref?.slug ?? mediaSlug, error: result.reason })
      continue
    }

    const batch = result.value
    failures.push(...batch.failures)
    for (const change of batch.changes) {
      const key = changeKey(change)
      if (seen.has(key)) continue
      seen.add(key)
      changes.push(change)
    }
  }

  return { complete: failures.length === 0, changes, failures }
}
