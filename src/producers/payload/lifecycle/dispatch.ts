import { DEFAULT_MAX_EVENT_ITEMS } from '../../../core/event-limits.js'
import type { Dispatcher } from '../../../core/index.js'
import { changesToRevalidationEvent } from '../schema.js'
import { revalidationLogError } from './log.js'
import type { RevalidationChange } from './types.js'

type RevalidationLogger = {
  error: (message: string) => void
  warn?: (message: string) => void
  info?: (message: string) => void
}

export const chunkChanges = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * Dispatch source-specific revalidation events via configured dispatcher.
 * Fail-open for Payload saves — log errors, never throw.
 */
export const postRevalidationChanges = async ({
  changes,
  logger,
  dispatcher,
}: {
  changes: RevalidationChange[]
  logger: RevalidationLogger
  dispatcher: Dispatcher
}): Promise<void> => {
  if (!changes.length) return

  try {
    // Every change is delivered: large change sets are split into events within the consumer item limit.
    const events = chunkChanges(changes, DEFAULT_MAX_EVENT_ITEMS).map(changesToRevalidationEvent)
    const outcome = await dispatcher.dispatch({ events })
    if (outcome.status !== 'accepted') {
      revalidationLogError(
        logger,
        `dispatcher ${outcome.status} · ${outcome.error?.message ?? 'unknown'}`,
      )
    }
  } catch (error) {
    revalidationLogError(logger, error instanceof Error ? error.message : String(error))
  }
}
