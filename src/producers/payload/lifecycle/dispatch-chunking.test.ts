import { describe, expect, it } from 'bun:test'
import { postRevalidationChanges } from './dispatch.ts'
import type { RevalidationChange } from './types.ts'

const logger = { error: () => undefined }
const source = 'https://cms.example/revalidation'

describe('postRevalidationChanges', () => {
  it('sends grouped root and affected resources in one CloudEvent', async () => {
    const sent: { events: unknown[] }[] = []
    const dispatcher = {
      dispatch: async (input: { events: unknown[] }) => {
        sent.push(input)
        return { status: 'accepted' as const, results: [] }
      },
    }
    const changes: RevalidationChange[] = Array.from({ length: 250 }, (_, index) => ({
      type: 'collection',
      slug: 'pages',
      operation: 'update',
      locale: 'en',
      doc: { id: index, slug: `page-${index}` },
    }))

    await postRevalidationChanges({ changes, source, logger, dispatcher: dispatcher as never })

    expect(sent).toHaveLength(1)
    expect(sent[0]!.events).toHaveLength(1)
    expect((sent[0]!.events[0] as { data: { affected: unknown[] } }).data.affected).toHaveLength(
      250,
    )
  })

  it('sends nothing when no changes exist', async () => {
    const sent: unknown[] = []
    await postRevalidationChanges({
      changes: [],
      source,
      logger,
      dispatcher: { dispatch: async (input: unknown) => sent.push(input) } as never,
    })
    expect(sent).toHaveLength(0)
  })
})
