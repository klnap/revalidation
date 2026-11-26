import { describe, expect, it, mock } from 'bun:test'

import type { DispatchInput } from '../../../src/core/types'
import {
  deferRevalidationUntilCommit,
  dispatchRevalidationChanges,
  isRevalidationAllLocales,
  markRevalidationAllLocales,
  takeDeferredDispatches,
} from '../../../src/producers/payload/lifecycle/deferred'
import type { RevalidationChange } from '../../../src/producers/payload/lifecycle/types'

describe('deferRevalidationUntilCommit', () => {
  it('leaves dispatch inline when no deferral is active', () => {
    expect(takeDeferredDispatches({ context: {} })).toBeUndefined()
    expect(takeDeferredDispatches({})).toBeUndefined()
  })

  it('marks a request as all-locales only when asked', () => {
    const req: { context?: Record<string, unknown> } = {}
    expect(isRevalidationAllLocales(req)).toBe(false)
    markRevalidationAllLocales(req)
    expect(isRevalidationAllLocales(req)).toBe(true)
  })

  it('dispatches deduplicated changes only when the owner flushes after commit', async () => {
    const req: { context: Record<string, unknown> } = { context: {} }
    const dispatcher = {
      dispatch: mock(async (_input: DispatchInput) => ({
        status: 'accepted' as const,
        results: [],
      })),
    }
    const change: RevalidationChange = {
      type: 'collection',
      slug: 'projects',
      operation: 'update',
      locale: 'en',
      doc: { id: '1', slug: 'tower' },
    }
    const deferral = deferRevalidationUntilCommit(req)

    await dispatchRevalidationChanges({
      req,
      changes: [change, change],
      dispatcher,
      logger: { error: () => {} },
    })

    expect(dispatcher.dispatch).not.toHaveBeenCalled()
    await deferral.flush()
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    expect(
      (
        dispatcher.dispatch.mock.calls[0]![0].events[0]!.data as {
          affected: unknown[]
        }
      ).affected,
    ).toHaveLength(1)
  })

  it('discards deferred changes after rollback', async () => {
    const req: { context: Record<string, unknown> } = { context: {} }
    const dispatcher = {
      dispatch: mock(async (_input: DispatchInput) => ({
        status: 'accepted' as const,
        results: [],
      })),
    }
    const deferral = deferRevalidationUntilCommit(req)

    await dispatchRevalidationChanges({
      req,
      changes: [
        {
          type: 'global',
          slug: 'home',
          operation: 'update',
          locale: 'en',
          doc: { id: 'home' },
        },
      ],
      dispatcher,
      logger: { error: () => {} },
    })

    deferral.discard()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
  })
})
