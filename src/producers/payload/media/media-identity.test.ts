import { describe, expect, it, mock } from 'bun:test'
import { resolveMediaDependentChanges } from './resolve-media-dependents.js'

const upload = { name: 'hero', type: 'upload', relationTo: 'media' }

describe('media-triggered events carry the parent identity', () => {
  it('uses the configured identifier as the route key instead of the slug', async () => {
    const find = mock(({ where }: { where?: Record<string, unknown> }) =>
      Promise.resolve({
        docs:
          where && 'hero' in where ? [{ id: 1, slug: 'b', uid: 'a', _status: 'published' }] : [],
      }),
    )
    const payload = {
      config: {
        collections: [
          {
            slug: 'posts',
            custom: { revalidation: { identifier: 'uid' } },
            versions: { drafts: false },
            fields: [upload],
          },
        ],
        globals: [],
      },
      collections: {
        posts: {
          config: { slug: 'posts', custom: { revalidation: { identifier: 'uid' } }, fields: [] },
        },
      },
      find,
      findGlobal: mock(),
    }

    const changes = await resolveMediaDependentChanges({
      mediaId: 7,
      mediaSlug: 'media',
      locales: ['en'],
      payload: payload as never,
    })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ routeSlug: 'a', identifiers: { uid: 'a' } })
  })
})
