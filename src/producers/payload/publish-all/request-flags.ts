/** Payload Admin / Local API query flags for publish-all detection. */

const isTruthyFlag = (value: unknown): boolean => value === 'true' || value === true

type PublishAllLocalesRequest = {
  query?: Record<string, unknown>
  context?: Record<string, unknown> | null
}

/**
 * Publish-all detection for hook guards.
 *
 * - Admin / REST: `req.query.publishAllLocales`
 * - Local API: set `req.context.publishAllLocales` when passing `publishAllLocales: true`
 */
export const isPublishAllLocales = (req: PublishAllLocalesRequest): boolean =>
  isTruthyFlag(req.query?.publishAllLocales) || isTruthyFlag(req.context?.publishAllLocales)
