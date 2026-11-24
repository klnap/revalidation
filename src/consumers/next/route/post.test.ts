import { afterEach, describe, expect, it } from 'bun:test'
import {
  type PayloadRevalidationItem,
  payloadRevalidationItemSchema,
} from '../../../sources/payload'
import { defineRevalidation, resetDefinedRevalidation } from '../define-revalidation.ts'

afterEach(() => {
  resetDefinedRevalidation()
})

describe('route POST', () => {
  it('throws when defineRevalidation was not called', async () => {
    const { POST } = await import('./post.ts')
    await expect(POST(new Request('http://localhost/api/revalidate'))).rejects.toThrow(
      /must be called before/,
    )
  })

  it('returns 401 without authorization when registry exists', async () => {
    defineRevalidation({
      secret: 'test-secret',
      tags: {
        project: '[locale]:project:[slug]',
      },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: ({ item }) => {
            const d = item as PayloadRevalidationItem
            return d.key
          },
        },
      },
      layers: (t) => ({
        next: [{ key: { payload: 'projects' }, invalidates: [t.project] }],
      }),
    })

    const { POST } = await import('./post.ts')
    const res = await POST(
      new Request('http://localhost/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'payload',
          data: {
            locale: 'en',
            key: 'projects',
            collection: 'projects',
            slug: 'x',
            operation: 'update',
          },
        }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
