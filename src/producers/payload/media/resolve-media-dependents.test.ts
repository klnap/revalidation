import { describe, expect, test } from 'bun:test'
import { resolveCollectionDependents } from './resolve-media-dependents.js'

const mediaRef = {
  slug: 'posts',
  wherePath: 'hero',
  hasMany: false,
  hasDrafts: false,
} as never

/** Pages of dependents with one document per id. Payload's page metadata drives the traversal. */
function pagedPayload(total: number) {
  const pages: number[] = []
  return {
    pages,
    payload: {
      find: async ({ page, limit }: { page: number; limit: number }) => {
        pages.push(page)
        const start = (page - 1) * limit
        const end = Math.min(start + limit, total)
        const docs = Array.from({ length: Math.max(0, end - start) }, (_, i) => ({
          id: start + i + 1,
          slug: `p-${start + i + 1}`,
          _status: 'published',
          title: 'x',
        }))
        return { docs, hasNextPage: end < total, nextPage: end < total ? page + 1 : null }
      },
    },
  }
}

describe('resolveMediaDependentChanges pagination', () => {
  test('dependents beyond one page are all returned', async () => {
    const { payload, pages } = pagedPayload(1200)
    const changes = await resolveCollectionDependents({
      ref: mediaRef,
      mediaId: 7,
      payload: payload as never,
      locales: ['en'],
      operation: 'update',
    })
    expect(changes.length).toBe(1200)
    expect(pages).toEqual([1, 2, 3])
  })

  test('zero, one and exactly one page are handled', async () => {
    for (const total of [0, 1, 500]) {
      const { payload } = pagedPayload(total)
      const changes = await resolveCollectionDependents({
        ref: mediaRef,
        mediaId: 7,
        payload: payload as never,
        locales: ['en'],
        operation: 'update',
      })
      expect(changes.length).toBe(total)
    }
  })
})
