import type { CacheEvent } from '../../core/index.js'
import type { PayloadRevalidationItem } from '../../sources/payload/index.js'
import type { RevalidationChange } from './lifecycle/types.js'

export type { PayloadRevalidationItem }

const readSlug = (doc: Record<string, unknown> | undefined): string | undefined => {
  const slug = doc?.slug
  return typeof slug === 'string' && slug.length > 0 ? slug : undefined
}

export const changesToRevalidationItems = (
  changes: RevalidationChange[],
): PayloadRevalidationItem[] =>
  changes.map((change) => {
    const id = change.doc.id
    return {
      operation: change.operation,
      locale: change.locale,
      key: change.slug,
      ...(change.type === 'collection' ? { collection: change.slug } : { global: change.slug }),
      slug: change.type === 'collection' ? (change.routeSlug ?? readSlug(change.doc)) : undefined,
      documentId: typeof id === 'string' || typeof id === 'number' ? String(id) : undefined,
      ...(change.identifiers ? { identifiers: change.identifiers } : {}),
    }
  })

export const changesToRevalidationEvent = (changes: RevalidationChange[]): CacheEvent => ({
  source: 'payload',
  data: changesToRevalidationItems(changes),
})
