/**
 * True when doc has no published status (string draft, localizeStatus map
 * without `published`, or missing `_status`). Used when Local API / admin
 * autosave create sets `draft: true` without `req.query.draft`.
 */
export const isUnpublishedStatus = (status: unknown): boolean => {
  if (status === 'published') return false
  if (status === 'draft' || status == null) return true
  if (typeof status === 'object') {
    return !Object.values(status as Record<string, unknown>).includes('published')
  }
  return true
}
