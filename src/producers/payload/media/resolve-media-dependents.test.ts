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
  const cursors: Array<number | undefined> = []
  const queries: Array<{ where?: unknown; sort?: string; limit?: number }> = []
  const rows = Array.from({ length: total }, (_, index) => ({
    id: index + 1,
    slug: `p-${index + 1}`,
    _status: 'published',
    title: 'x',
  }))
  return {
    cursors,
    queries,
    payload: {
      find: async ({
        limit,
        where,
        sort,
      }: {
        limit: number
        where?: { and?: Array<{ id?: { greater_than?: number } }> }
        sort?: string
      }) => {
        const cursor = where?.and?.find((clause) => clause.id)?.id?.greater_than
        cursors.push(cursor)
        queries.push({ where, sort, limit })
        const matching = cursor === undefined ? [...rows] : rows.filter((row) => row.id > cursor)
        const docs = matching.slice(0, limit)
        const hasNextPage = matching.length > limit
        return { docs, hasNextPage, nextPage: hasNextPage ? 2 : null }
      },
    },
  }
}

describe('resolveMediaDependentChanges pagination', () => {
  test('dependents beyond one page are all returned', async () => {
    const { payload, cursors, queries } = pagedPayload(1200)
    const resolution = await resolveCollectionDependents({
      ref: mediaRef,
      mediaId: 7,
      payload: payload as never,
      req: {} as never,
      locales: ['en'],
      operation: 'update',
    })
    expect(resolution.complete).toBe(true)
    expect(resolution.changes.map((change) => change.doc.id)).toEqual(
      Array.from({ length: 1200 }, (_, index) => index + 1),
    )
    expect(new Set(resolution.changes.map((change) => change.doc.id)).size).toBe(1200)
    expect(cursors).toEqual([undefined, 500, 1000])
    expect(queries).toEqual([
      { where: { hero: { equals: 7 } }, sort: 'id', limit: 500 },
      {
        where: { and: [{ hero: { equals: 7 } }, { id: { greater_than: 500 } }] },
        sort: 'id',
        limit: 500,
      },
      {
        where: { and: [{ hero: { equals: 7 } }, { id: { greater_than: 1000 } }] },
        sort: 'id',
        limit: 500,
      },
    ])
  })

  test('does not skip later dependents when earlier rows disappear between pages', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      slug: `p-${index + 1}`,
      _status: 'published',
      title: 'x',
    }))
    let removedEarlierRow = false
    const cursors: Array<number | undefined> = []
    const payload = {
      find: async ({
        page,
        limit,
        where,
      }: {
        page: number
        limit: number
        where?: { and?: Array<{ id?: { greater_than?: number } }> }
      }) => {
        const cursor = where?.and?.find((clause) => clause.id)?.id?.greater_than
        cursors.push(cursor)
        const matching = cursor === undefined ? [...rows] : rows.filter((row) => row.id > cursor)
        const start = cursor === undefined ? (page - 1) * limit : 0
        const docs = matching.slice(start, start + limit)
        if (page === 1 && !removedEarlierRow) {
          rows.shift()
          removedEarlierRow = true
        }
        return {
          docs,
          hasNextPage: matching.length > start + limit,
          nextPage: matching.length > start + limit ? page + 1 : null,
        }
      },
    }

    const { changes } = await resolveCollectionDependents({
      ref: mediaRef,
      mediaId: 7,
      payload: payload as never,
      req: {} as never,
      locales: ['en'],
      operation: 'update',
    })

    expect(cursors).toEqual([undefined, 500])
    expect(changes.map((change) => change.doc.id)).toEqual(
      Array.from({ length: 501 }, (_, index) => index + 1),
    )
  })

  test('keeps completed pages when a later dependency query fails', async () => {
    let calls = 0
    const payload = {
      find: async ({ limit }: { limit: number }) => {
        calls += 1
        if (calls === 2) throw new Error('page query failed')
        return {
          docs: Array.from({ length: limit }, (_, index) => ({
            id: index + 1,
            slug: `p-${index + 1}`,
            _status: 'published',
          })),
          hasNextPage: true,
        }
      },
    }

    const resolution = await resolveCollectionDependents({
      ref: mediaRef,
      mediaId: 7,
      payload: payload as never,
      req: {} as never,
      locales: ['en'],
      operation: 'update',
    })

    expect(resolution.changes).toHaveLength(500)
    expect(resolution.complete).toBe(false)
    expect(resolution.failures).toMatchObject([
      { refSlug: 'posts', locale: 'en', error: new Error('page query failed') },
    ])
  })

  test('continues with later locales after one locale query fails', async () => {
    const locales: string[] = []
    const resolution = await resolveCollectionDependents({
      ref: mediaRef,
      mediaId: 7,
      payload: {
        find: async ({ locale }: { locale: string }) => {
          locales.push(locale)
          if (locale === 'en') throw new Error('English query failed')
          return { docs: [{ id: 2, slug: 'de-page', title: 'German' }], hasNextPage: false }
        },
      } as never,
      req: {} as never,
      locales: ['en', 'de'],
      operation: 'update',
    })

    expect(locales).toEqual(['en', 'de'])
    expect(resolution.complete).toBe(false)
    expect(resolution.changes.map((change) => change.locale)).toEqual(['de'])
    expect(resolution.failures).toMatchObject([
      { refSlug: 'posts', locale: 'en', error: new Error('English query failed') },
    ])
  })

  test('stops when a page cursor moves backwards', async () => {
    let calls = 0
    const resolution = await resolveCollectionDependents({
      ref: mediaRef,
      mediaId: 7,
      payload: {
        find: async () => {
          calls += 1
          return {
            docs: [{ id: calls === 1 ? 500 : 400, slug: `p-${calls}`, _status: 'published' }],
            hasNextPage: true,
          }
        },
      } as never,
      req: {} as never,
      locales: ['en'],
      operation: 'update',
    })

    expect(calls).toBe(2)
    expect(resolution.complete).toBe(false)
    expect(resolution.changes).toHaveLength(2)
    expect(resolution.failures).toMatchObject([
      {
        refSlug: 'posts',
        locale: 'en',
        error: new Error('Payload dependency pagination did not advance for posts'),
      },
    ])
  })

  test('zero, one and exactly one page are handled', async () => {
    for (const total of [0, 1, 500]) {
      const { payload } = pagedPayload(total)
      const { changes } = await resolveCollectionDependents({
        ref: mediaRef,
        mediaId: 7,
        payload: payload as never,
        req: {} as never,
        locales: ['en'],
        operation: 'update',
      })
      expect(changes.length).toBe(total)
    }
  })
})
