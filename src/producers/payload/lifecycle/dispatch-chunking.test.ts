import { describe, expect, test } from 'bun:test'
import { DEFAULT_MAX_EVENT_ITEMS } from '../../../core/event-limits.js'
import { chunkChanges, postRevalidationChanges } from './dispatch.js'
import type { RevalidationChange } from './types.js'

const change = (i: number): RevalidationChange => ({
  type: 'collection',
  slug: 'posts',
  operation: 'update',
  locale: 'en',
  doc: { id: i, slug: `p-${i}` },
})

const changes = (n: number) => Array.from({ length: n }, (_, i) => change(i))
const logger = { error: () => undefined }

describe('chunkChanges', () => {
  test('splits at the boundary without dropping items', () => {
    for (const n of [0, 1, DEFAULT_MAX_EVENT_ITEMS, DEFAULT_MAX_EVENT_ITEMS + 1, 250]) {
      const chunks = chunkChanges(changes(n), DEFAULT_MAX_EVENT_ITEMS)
      expect(chunks.flat().length).toBe(n)
      for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(DEFAULT_MAX_EVENT_ITEMS)
    }
  })

  test('100 changes is one event and 101 changes is two', () => {
    expect(chunkChanges(changes(100), 100).length).toBe(1)
    expect(chunkChanges(changes(101), 100).map((c) => c.length)).toEqual([100, 1])
  })
})

describe('postRevalidationChanges event sizing', () => {
  const capture = () => {
    const sent: Array<{ events: Array<{ data: unknown[] }> }> = []
    const dispatcher = {
      dispatch: async (input: { events: Array<{ data: unknown[] }> }) => {
        sent.push(input)
        return { status: 'accepted' as const }
      },
    }
    return { sent, dispatcher }
  }

  test('zero changes sends nothing', async () => {
    const { sent, dispatcher } = capture()
    await postRevalidationChanges({ changes: [], logger, dispatcher: dispatcher as never })
    expect(sent.length).toBe(0)
  })

  test('every event stays within the consumer item limit and every change is delivered', async () => {
    for (const n of [1, DEFAULT_MAX_EVENT_ITEMS, DEFAULT_MAX_EVENT_ITEMS + 1, 250]) {
      const { sent, dispatcher } = capture()
      await postRevalidationChanges({
        changes: changes(n),
        logger,
        dispatcher: dispatcher as never,
      })
      expect(sent.length).toBe(1)
      const events = sent[0]!.events
      for (const event of events)
        expect(event.data.length).toBeLessThanOrEqual(DEFAULT_MAX_EVENT_ITEMS)
      expect(events.reduce((sum, event) => sum + event.data.length, 0)).toBe(n)
    }
  })
})
