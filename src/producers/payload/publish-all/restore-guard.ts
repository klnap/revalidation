/**
 * Tracks request objects created internally for locale restoration writes.
 *
 * Using a WeakSet (rather than a user-controllable `req.context` flag) prevents
 * external or unrelated callers from suppressing required revalidation by
 * setting `context.preserveLocalesRestore`.
 */
const restoreReqs = new WeakSet<object>()

export const markLocaleRestoreReq = (req: object): void => {
  restoreReqs.add(req)
}

export const isLocaleRestoreReq = (req: unknown): boolean =>
  typeof req === 'object' && req !== null && restoreReqs.has(req)
