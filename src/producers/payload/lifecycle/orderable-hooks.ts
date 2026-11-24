import {
  deferRevalidationUntilCommit,
  markRevalidationAllLocales,
  markRevalidationOrderOnly,
  type RevalidationDeferral,
} from './deferred.js'

type OrderableRequest = { context?: Record<string, unknown> }

/**
 * Structurally compatible with `@klnap/payload-orderable` hooks. Neither package imports the other;
 * the host passes this object to `orderable({ hooks })`.
 */
export type RevalidationOrderableHooks = {
  beforeWrite: (req: OrderableRequest, batch: { orderScope: 'global' | 'locale' }) => void
  onCommitted: (event: unknown, req: OrderableRequest) => Promise<void>
  onRolledBack: (error: unknown, req: OrderableRequest) => void
}

/**
 * Hooks for `orderable()` that keep reorder writes out of the transaction and dispatch one
 * revalidation request after commit. A reorder is recorded as order-only, and a global reorder
 * revalidates every locale. Rolled-back reorders are discarded.
 */
export const revalidationOrderableHooks = (): RevalidationOrderableHooks => {
  const deferrals = new WeakMap<object, RevalidationDeferral>()
  return {
    beforeWrite: (req, { orderScope }) => {
      if (orderScope === 'global') markRevalidationAllLocales(req)
      markRevalidationOrderOnly(req)
      deferrals.set(req, deferRevalidationUntilCommit(req))
    },
    onCommitted: async (_event, req) => {
      const deferral = deferrals.get(req)
      deferrals.delete(req)
      await deferral?.flush()
    },
    onRolledBack: (_error, req) => {
      deferrals.get(req)?.discard()
      deferrals.delete(req)
    },
  }
}
