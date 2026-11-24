import { describe, expect, it, mock } from 'bun:test'

import { compileHostRevalidation } from '../../../src/consumers/next/compile-revalidation-host'
import { createRevalidationHandler } from '../../../src/consumers/next/create-cache'
import { http } from '../../../src/dispatchers/http'
import { postRevalidationChanges } from '../../../src/producers/payload/lifecycle/dispatch'

describe('HTTP producer → Next consumer', () => {
  it('dispatches wire envelope and runs configured invalidation', async () => {
    const invalidated: string[] = []

    const { config } = compileHostRevalidation({
      secret: 'shared-secret',
      tags: { page: '[locale]:page' },
      resolve: ({ item }) => (item as { key: string }).key,
      invalidate: (t) => ({ pages: [t.page] }),
      execute: {
        next: async ({ tags }) => {
          invalidated.push(...tags.map((entry) => entry.value))
        },
      },
    })

    const handler = createRevalidationHandler(config)

    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      const response = await handler(
        new Request('http://localhost/api/revalidate', {
          method: 'POST',
          headers: init?.headers as HeadersInit,
          body: typeof init?.body === 'string' ? init.body : undefined,
        }),
      )
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      }
    }) as unknown as typeof fetch

    await postRevalidationChanges({
      changes: [
        {
          type: 'collection',
          slug: 'pages',
          operation: 'update',
          locale: 'en',
          doc: { id: '1', slug: 'hello' },
          routeSlug: 'hello',
        },
      ],
      logger: { error: mock(() => {}) },
      dispatcher: http({
        target: { url: 'http://localhost/api/revalidate', secret: 'shared-secret' },
      }),
    })

    expect(invalidated).toEqual(['en:page'])
  })
})
