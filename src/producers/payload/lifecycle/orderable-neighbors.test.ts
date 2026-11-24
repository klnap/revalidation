import { expect, test } from 'bun:test'
import type { PayloadRequest, Where } from 'payload'

import { resolveOrderableNeighborChanges } from './orderable-neighbors.js'

test('resolves adjacent documents for an orderable collection without drafts', async () => {
  const queries: Where[] = []
  const req = {
    payload: {
      find: async ({ where }: { where: Where }) => {
        queries.push(where)
        return {
          docs: [
            { id: 'b', position: 'a0' },
            { id: 'a', position: 'a1' },
            { id: 'c', position: 'a2' },
          ],
        }
      },
    },
  } as unknown as PayloadRequest
  const base = { type: 'collection', operation: 'update', slug: 'catalog', locale: 'en' } as const
  const neighbors = await resolveOrderableNeighborChanges({
    req,
    collectionSlug: 'catalog',
    orderField: 'position',
    draftsEnabled: false,
    changes: [
      {
        ...base,
        doc: { id: 'a', position: 'a1' },
        previousOrder: { key: 'Zz', orderOnly: true },
      },
    ],
    toChange: (doc) => ({ ...base, doc }),
  })
  expect(queries).toEqual([{ position: { exists: true } }])
  expect(neighbors.map(({ doc }) => doc.id)).toEqual(['b', 'c'])
})
