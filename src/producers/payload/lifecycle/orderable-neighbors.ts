import type { PayloadRequest, Where } from 'payload'

import { toTypedLocale } from './helpers.js'
import type { RevalidationChange } from './types.js'

type Doc = Record<string, unknown>
type Neighbour = { id: string; key: string; doc: Doc }
type Links = { prev: string | null; next: string | null }

const linksOf = (list: Neighbour[]): Map<string, Links> => {
  const links = new Map<string, Links>()
  list.forEach((entry, index) => {
    links.set(entry.id, {
      prev: list[index - 1]?.id ?? null,
      next: list[index + 1]?.id ?? null,
    })
  })
  return links
}

const insertByKey = (list: Neighbour[], entry: Neighbour): Neighbour[] => {
  const index = list.findIndex((candidate) => candidate.key > entry.key)
  return index === -1 ? [...list, entry] : [...list.slice(0, index), entry, ...list.slice(index)]
}

/**
 * Exact neighbour diff for a document that moved to a new order key in one locale.
 *
 * Lists the published documents of the locale before and after the move (the moved document is
 * placed at its previous key for "before"). Returns the documents whose visible Previous/Next
 * changed. Returns `null` when the move is not a key change, so the caller uses the broad rule.
 */
const exactMoveNeighbours = async ({
  req,
  collectionSlug,
  locale,
  change,
  orderField,
  visible,
}: {
  req: PayloadRequest
  collectionSlug: string
  locale: string
  change: RevalidationChange
  orderField: string
  visible: Where
}): Promise<Doc[] | null> => {
  const previous = change.previousOrder
  const current = change.doc[orderField]
  if (!previous || typeof current !== 'string' || current === previous.key) return null
  if (!previous.orderOnly && previous.visible === undefined) return null

  const { docs } = await req.payload.find({
    collection: collectionSlug,
    locale: toTypedLocale(locale),
    fallbackLocale: false,
    depth: 0,
    draft: false,
    pagination: false,
    overrideAccess: true,
    req,
    sort: orderField,
    where: visible,
  })
  const movedId = String(change.doc.id)
  const after: Neighbour[] = docs.map((doc) => ({
    id: String(doc.id),
    key: String((doc as Doc)[orderField]),
    doc: doc as Doc,
  }))
  const isVisibleAfter = after.some((entry) => entry.id === movedId)
  // An order-only write does not change publication: visible before iff visible after.
  const wasVisible = previous.visible ?? isVisibleAfter
  if (!isVisibleAfter && !wasVisible) return []

  const others = after.filter((entry) => entry.id !== movedId)
  const before = wasVisible
    ? insertByKey(others, { id: movedId, key: previous.key, doc: change.doc })
    : others
  const linksBefore = linksOf(before)
  const linksAfter = linksOf(after)

  const changed: Doc[] = []
  for (const entry of others) {
    const b = linksBefore.get(entry.id)
    const a = linksAfter.get(entry.id)
    if (b?.prev !== a?.prev || b?.next !== a?.next) changed.push(entry.doc)
  }
  return changed
}

/**
 * Documents whose Previous/Next a change can affect, per locale, excluding the changed documents.
 *
 * - Moves to a new order key: exact diff of visible neighbours in that locale only.
 * - Everything else (content, slug, create, delete, publish state at the same key): the documents
 *   directly before and after the document's current and previous keys, read in the same locale.
 *   Broader than strictly required but it covers link labels and slugs.
 */
export const resolveOrderableNeighborChanges = async ({
  req,
  collectionSlug,
  changes,
  orderField,
  draftsEnabled,
  previousOrderKey,
  toChange,
}: {
  req: PayloadRequest
  collectionSlug: string
  changes: RevalidationChange[]
  orderField: string
  draftsEnabled: boolean
  previousOrderKey?: unknown
  toChange: (doc: Doc, locale: string) => RevalidationChange
}): Promise<RevalidationChange[]> => {
  const seen = new Set(changes.map((change) => `${change.locale}:${String(change.doc.id)}`))
  const visible: Where = {
    [orderField]: { exists: true },
    ...(draftsEnabled ? { _status: { equals: 'published' } } : {}),
  }
  const neighbours: RevalidationChange[] = []
  const add = (doc: Doc, locale: string) => {
    const dedupeKey = `${locale}:${String(doc.id)}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    neighbours.push(toChange(doc, locale))
  }

  for (const change of changes) {
    if (change.type !== 'collection') continue
    const id = String(change.doc.id)

    const exact =
      change.operation === 'update' &&
      change.previousOrder &&
      (change.previousOrder.orderOnly || change.previousOrder.routeSlug === change.routeSlug)
        ? await exactMoveNeighbours({
            req,
            collectionSlug,
            locale: change.locale,
            change,
            orderField,
            visible,
          })
        : null
    if (exact) {
      for (const doc of exact) add(doc, change.locale)
      continue
    }

    const keys = [change.doc[orderField], change.previousOrder?.key, previousOrderKey].filter(
      (key): key is string => typeof key === 'string' && key.length > 0,
    )
    for (const key of new Set(keys)) {
      const locale = toTypedLocale(change.locale)
      const [before, after] = await Promise.all([
        req.payload.find({
          collection: collectionSlug,
          locale,
          fallbackLocale: false,
          depth: 0,
          draft: false,
          limit: 1,
          pagination: false,
          overrideAccess: true,
          req,
          sort: `-${orderField}`,
          where: {
            and: [{ [orderField]: { less_than: key } }, { id: { not_equals: id } }, visible],
          },
        }),
        req.payload.find({
          collection: collectionSlug,
          locale,
          fallbackLocale: false,
          depth: 0,
          draft: false,
          limit: 1,
          pagination: false,
          overrideAccess: true,
          req,
          sort: orderField,
          where: {
            and: [{ [orderField]: { greater_than: key } }, { id: { not_equals: id } }, visible],
          },
        }),
      ])
      for (const result of [...before.docs, ...after.docs]) add(result as Doc, change.locale)
    }
  }

  return neighbours
}
