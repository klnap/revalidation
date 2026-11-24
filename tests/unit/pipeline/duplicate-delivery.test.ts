import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../src/consumers/next/compile-revalidation-host'
import { createRevalidationHandler } from '../../../src/consumers/next/create-cache'

describe('duplicate consumer delivery', () => {
  it('accepts repeated POSTs (at-least-once delivery)', async () => {
    let runs = 0
    const { config } = compileHostRevalidation({
      secret: 'dup-secret',
      tags: { page: '[locale]:page' },
      resolve: ({ item }) => (item as { key: string }).key,
      invalidate: (t) => ({ pages: [t.page] }),
      execute: {
        next: async () => {
          runs += 1
        },
      },
    })

    const handler = createRevalidationHandler(config)
    const body = JSON.stringify({
      source: 'payload',
      data: {
        operation: 'update',
        locale: 'en',
        key: 'pages',
        collection: 'pages',
        slug: 'a',
      },
    })

    const post = () =>
      handler(
        new Request('http://localhost/api/revalidate', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer dup-secret',
            'Content-Type': 'application/json',
          },
          body,
        }),
      )

    const first = await post()
    const second = await post()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(runs).toBe(2)
  })
})
