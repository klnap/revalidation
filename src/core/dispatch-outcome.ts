import type { DispatchError, DispatchOutcome } from './types.js'

export const createDispatchError = (
  code: string,
  message: string,
  cause?: unknown,
): DispatchError => ({
  code,
  message,
  cause,
})

/** Merge per-target / per-event outcomes into a single dispatcher result (never throws). */
export const aggregateDispatchOutcomes = (
  results: DispatchOutcome[],
  fallbackCode = 'DISPATCH_AGGREGATE_ERROR',
): DispatchOutcome => {
  if (results.some((r) => r.status === 'unknown')) {
    return {
      status: 'unknown',
      error: createDispatchError(fallbackCode, 'One or more targets returned unknown'),
    }
  }
  if (results.some((r) => r.status === 'failed')) {
    const details = results
      .filter((r): r is Extract<DispatchOutcome, { status: 'failed' }> => r.status === 'failed')
      .map((r) => r.error.message)
      .join('; ')
    return {
      status: 'failed',
      error: createDispatchError(
        fallbackCode,
        details ? `One or more targets failed: ${details}` : 'One or more targets failed',
      ),
    }
  }
  if (results.every((r) => r.status === 'accepted')) {
    return { status: 'accepted' }
  }
  return {
    status: 'rejected',
    error: createDispatchError(fallbackCode, 'All targets rejected'),
  }
}
