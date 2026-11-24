/**
 * A caller that owns the transaction can defer revalidation until commit. It begins deferral, runs its
 * writes, then calls `flush()` after commit or `discard()` after rollback.
 *
 * Changes are deduplicated by (type, collection/global, locale, document, operation) before they are
 * dispatched, so a document in a locale is named once even when several writes in the transaction touched it.
 */
import type { Dispatcher } from '../../../core/index.js'
import { postRevalidationChanges } from './dispatch.js'
import type { RevalidationChange } from './types.js'

type DeferredRequest = { context?: Record<string, unknown> }

type RevalidationLogger = {
  error: (message: string) => void
  warn?: (message: string) => void
  info?: (message: string) => void
}

type DeferredChanges = {
  changes: RevalidationChange[]
  logger: RevalidationLogger
  dispatcher: Dispatcher
}

const DEFERRED_KEY = '__revalidationDeferred'

/** Set by writes that are not locale edits (for example a global reorder): dispatch every locale. */
const ALL_LOCALES_KEY = '__revalidationAllLocales'

/** Set by writes that change only `_order`. */
const ORDER_ONLY_KEY = '__revalidationOrderOnly'

export type RevalidationDeferral = {
  /** Dispatches this request's changes. Call only after commit. */
  flush: () => Promise<void>
  /** Drops deferred changes after the transaction rolled back. */
  discard: () => void
}

/** Change keys already staged by this transaction, so repeated writes do not dispatch duplicates. */
const seenByQueue = new WeakMap<DeferredChanges[], Set<string>>()

/** Starts deferral for this request. Nested writes in the same request queue into it. */
export const deferRevalidationUntilCommit = (req: DeferredRequest): RevalidationDeferral => {
  const queue: DeferredChanges[] = []
  req.context = req.context ?? {}
  req.context[DEFERRED_KEY] = queue

  const release = () => {
    if (req.context?.[DEFERRED_KEY] === queue) delete req.context[DEFERRED_KEY]
  }

  return {
    flush: async () => {
      release()
      const pending = queue.splice(0)
      const byDispatcher = new Map<Dispatcher, DeferredChanges[]>()
      for (const entry of pending) {
        byDispatcher.set(entry.dispatcher, [...(byDispatcher.get(entry.dispatcher) ?? []), entry])
      }
      for (const entries of byDispatcher.values()) {
        const [first] = entries
        if (!first) continue
        await postRevalidationChanges({
          changes: entries.flatMap((entry) => entry.changes),
          dispatcher: first.dispatcher,
          logger: first.logger,
        })
      }
    },
    discard: () => {
      release()
      queue.length = 0
      seenByQueue.delete(queue)
    },
  }
}

/**
 * Defers changes until `flush()` when a transaction owner is active. Otherwise, dispatch is attempted
 * shortly after the hook returns so the Payload write can commit first.
 */
export const dispatchRevalidationChanges = async ({
  req,
  changes,
  logger,
  dispatcher,
}: {
  req: DeferredRequest
  changes: RevalidationChange[]
  logger: RevalidationLogger
  dispatcher: Dispatcher
}): Promise<void> => {
  const queue = takeDeferredDispatches(req)
  let fresh = changes
  if (queue) {
    const seen = seenByQueue.get(queue) ?? new Set<string>()
    seenByQueue.set(queue, seen)
    fresh = changes.filter((change) => {
      const key = changeKey(change)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (fresh.length === 0) return

  if (queue) {
    queue.push({ changes: fresh, logger, dispatcher })
    return
  }
  scheduleBestEffortDispatch({ changes: fresh, dispatcher, logger })
}

/** Best-effort dispatch after the hook returns. There is no durable retry or recovery. */
const scheduleBestEffortDispatch = (args: {
  changes: RevalidationChange[]
  dispatcher: Dispatcher
  logger: RevalidationLogger
}): void => {
  const timer = setTimeout(async () => {
    await postRevalidationChanges(args)
  }, 1_000)
  timer.unref?.()
}

/** Returns the active deferred queue for this request, if any. */
export const takeDeferredDispatches = (req: DeferredRequest): DeferredChanges[] | undefined => {
  const queue = req.context?.[DEFERRED_KEY]
  return Array.isArray(queue) ? (queue as DeferredChanges[]) : undefined
}

/** Marks this request as a global write: revalidation covers every configured locale. */
export const markRevalidationAllLocales = (req: DeferredRequest): void => {
  req.context = req.context ?? {}
  req.context[ALL_LOCALES_KEY] = true
}

export const isRevalidationAllLocales = (req: DeferredRequest): boolean =>
  req.context?.[ALL_LOCALES_KEY] === true

/**
 * Marks this request as writing only the order key (no content, no publication change). Neighbour
 * resolution may then take the previous key from the hook's previous document and derive visibility
 * from the locale's current list.
 */
export const markRevalidationOrderOnly = (req: DeferredRequest): void => {
  req.context = req.context ?? {}
  req.context[ORDER_ONLY_KEY] = true
}

export const isRevalidationOrderOnly = (req: DeferredRequest): boolean =>
  req.context?.[ORDER_ONLY_KEY] === true

const changeKey = (change: RevalidationChange): string =>
  // routeSlug is part of the identity: a slug change dispatches the old and the new route for one doc.
  [
    change.type,
    change.slug,
    change.locale,
    String(change.doc.id),
    change.operation,
    change.routeSlug ?? '',
    JSON.stringify(change.identifiers ?? null),
  ].join('\u0000')
