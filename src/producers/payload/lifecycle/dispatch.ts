import type { Dispatcher } from '../../../core/index.js'
import { changesToRevalidationEvent } from '../schema.js'
import { revalidationLogError } from './log.js'
import type { RevalidationChange } from './types.js'

type RevalidationLogger = {
  error: (message: string) => void
  warn?: (message: string) => void
  info?: (message: string) => void
}

/**
 * Dispatch source-specific revalidation events via configured dispatcher.
 * Fail-open for Payload saves — log errors, never throw.
 */
export const postRevalidationChanges = async ({
  changes,
  source,
  logger,
  dispatcher,
}: {
  changes: RevalidationChange[]
  source: string
  logger: RevalidationLogger
  dispatcher: Dispatcher
}): Promise<void> => {
  if (!changes.length) return

  try {
    const events = [changesToRevalidationEvent(changes, source)]
    const outcome = await dispatcher.dispatch({ events })
    if (outcome.status !== 'accepted') {
      const errors = outcome.results.flatMap((result) => result.error?.message ?? [])
      revalidationLogError(
        logger,
        `dispatcher ${outcome.status}${errors.length ? ` · ${errors.join('; ')}` : ''}`,
      )
    }
  } catch (error) {
    revalidationLogError(logger, error instanceof Error ? error.message : String(error))
  }
}
