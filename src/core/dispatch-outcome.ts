import type { DispatchError, DispatchOutcome, TargetDispatchResult } from './types.js'

export const createDispatchError = (code: string, message: string): DispatchError => ({
  code,
  message,
})

/** Merge per-target-chunk outcomes into one dispatcher result. */
export const aggregateDispatchOutcomes = (
  results: readonly TargetDispatchResult[],
): DispatchOutcome => {
  if (results.length === 0 || results.every(({ status }) => status === 'accepted')) {
    return { status: 'accepted', results }
  }
  if (results.some(({ status }) => status === 'accepted')) return { status: 'partial', results }
  if (results.some(({ status }) => status === 'unknown')) return { status: 'unknown', results }
  if (results.every(({ status }) => status === 'rejected')) return { status: 'rejected', results }
  return { status: 'failed', results }
}
