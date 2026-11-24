/**
 * App Router `POST /api/revalidate` — re-export from `@klnap/revalidation/consumers/next`.
 *
 * ```ts
 * await import('@/revalidation') in instrumentation register()
 * export { POST } from '@klnap/revalidation/consumers/next'
 * ```
 */

import { createRevalidationHandler } from '../create-cache.js'
import { getDefinedRevalidation } from '../define-revalidation.js'

let route: { config: unknown; handler: (req: Request) => Promise<Response> } | undefined

// Rebuilds the handler when defineRevalidation replaces the configuration (for example on dev reload).
export async function POST(req: Request): Promise<Response> {
  const config = getDefinedRevalidation()
  if (!route || route.config !== config) {
    route = { config, handler: createRevalidationHandler(config) }
  }
  return route.handler(req)
}
