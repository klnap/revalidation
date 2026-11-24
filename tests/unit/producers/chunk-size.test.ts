import { describe, expect, it, mock } from 'bun:test'

import { postRevalidationChanges } from '../../../src/producers/payload/lifecycle/dispatch'
import type { RevalidationChange } from '../../../src/producers/payload/lifecycle/types'

const change = (index: number): RevalidationChange => ({
  type: 'collection',
  slug: 'projects',
  operation: 'update',
  locale: 'pl',
  doc: { id: `doc-${index}`, slug: `project-${index}` },
  routeSlug: `project-${index}`,
})

const logger = { error: mock(() => undefined) }

describe('producer chunk size', () => {
  it('splits changes by the dispatcher maxEventItems', async () => {
    const dispatch = mock(async () => ({ status: 'accepted' as const }))
    await postRevalidationChanges({
      changes: Array.from({ length: 5 }, (_, index) => change(index)),
      logger,
      dispatcher: { maxEventItems: 2, dispatch },
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    const [input] = dispatch.mock.calls[0] as unknown as [{ events: Array<{ data: unknown[] }> }]
    expect(input.events.map((event) => event.data.length)).toEqual([2, 2, 1])
  })

  it('uses 100 items when the dispatcher does not set a size', async () => {
    const dispatch = mock(async () => ({ status: 'accepted' as const }))
    await postRevalidationChanges({
      changes: Array.from({ length: 101 }, (_, index) => change(index)),
      logger,
      dispatcher: { dispatch },
    })
    const [input] = dispatch.mock.calls[0] as unknown as [{ events: Array<{ data: unknown[] }> }]
    expect(input.events.map((event) => event.data.length)).toEqual([100, 1])
  })

  it('does not dispatch and logs when the dispatcher size is out of range', async () => {
    const dispatch = mock(async () => ({ status: 'accepted' as const }))
    await postRevalidationChanges({
      changes: [change(0)],
      logger,
      dispatcher: { maxEventItems: 5000, dispatch },
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
})
