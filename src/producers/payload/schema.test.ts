import { describe, expect, it } from 'bun:test'

import { changesToRevalidationItems } from './schema.ts'

describe('changesToRevalidationItems', () => {
  it('sets key from collection slug and route slug from routeSlug', () => {
    const items = changesToRevalidationItems([
      {
        type: 'collection',
        slug: 'projects',
        operation: 'update',
        locale: 'en',
        doc: { id: '1', slug: 'doc-slug' },
        routeSlug: 'routing-slug',
      },
    ])

    expect(items).toEqual([
      {
        operation: 'update',
        locale: 'en',
        key: 'projects',
        collection: 'projects',
        slug: 'routing-slug',
        documentId: '1',
      },
    ])
  })

  it('sets key from global slug', () => {
    const items = changesToRevalidationItems([
      {
        type: 'global',
        slug: 'home-page',
        operation: 'update',
        locale: 'pl',
        doc: { id: undefined },
      },
    ])

    expect(items[0]?.key).toBe('home-page')
    expect(items[0]?.global).toBe('home-page')
    expect(items[0]?.slug).toBeUndefined()
  })
})
