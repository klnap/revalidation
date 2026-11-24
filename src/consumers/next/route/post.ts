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

let route: ((req: Request) => Promise<Response>) | undefined

export async function POST(req: Request): Promise<Response> {
  if (!route) {
    route = createRevalidationHandler(getDefinedRevalidation())
  }
  return route(req)
}
