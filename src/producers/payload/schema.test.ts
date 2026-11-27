import { describe, expect, it } from 'bun:test'
import { changesToRevalidationEvent } from './schema.ts'

const source = 'https://cms.example/revalidation'

describe('changesToRevalidationEvent', () => {
  it('keeps the trigger separate from all current, previous, and dependent identities', () => {
    const event = changesToRevalidationEvent(
      [
        {
          type: 'collection',
          slug: 'projects',
          operation: 'update',
          locale: 'en',
          doc: { id: '1', slug: 'doc-slug' },
          routeSlug: 'routing-slug',
        },
        {
          type: 'collection',
          slug: 'projects',
          operation: 'update',
          locale: 'en',
          doc: { id: '1', slug: 'old-slug' },
          identifiers: { slug: 'old-slug' },
        },
        {
          type: 'global',
          slug: 'settings',
          operation: 'update',
          locale: 'en',
          doc: {},
        },
      ],
      source,
    )

    expect(event).toMatchObject({
      specversion: '1.0',
      source,
      type: 'com.klnap.revalidation.resource.changed.v1',
      datacontenttype: 'application/json',
      data: {
        operation: 'update',
        resource: {
          type: 'payload.collection',
          name: 'projects',
          id: '1',
          locale: 'en',
          slug: 'routing-slug',
        },
        affected: [
          { operation: 'update', resource: { slug: 'routing-slug' } },
          {
            operation: 'update',
            resource: { slug: 'old-slug', identifiers: { slug: 'old-slug' } },
          },
          { operation: 'update', resource: { type: 'payload.global', name: 'settings' } },
        ],
      },
    })
    expect(event.id).toMatch(/^rev_[0-9a-f-]{36}$/)
    expect(event.time).toBeTruthy()
  })

  it('rejects an empty change set', () => {
    expect(() => changesToRevalidationEvent([], source)).toThrow()
  })
})
