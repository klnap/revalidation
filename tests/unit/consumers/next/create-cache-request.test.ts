import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { createCache } from '../../../../src/consumers/next/create-cache'
import { payloadRevalidationItemSchema } from '../../../../src/sources/payload'

const handlerFor = (overrides: Record<string, unknown> = {}) => {
  const { config } = compileHostRevalidation({
    secret: 'secret',
    tags: { homePage: '[locale]:home' },
    sources: {
      payload: {
        schema: payloadRevalidationItemSchema,
        resolve: () => 'home-page',
      },
    },
    layers: (t) => ({
      next: [{ key: { payload: 'home-page' }, invalidates: [t.homePage] }],
    }),
  })
  return createCache({ ...config, ...overrides })
}

const post = (authorization: string, body = '{"source":"payload","data":{}}') =>
  new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body,
  })

describe('createCache authorization', () => {
  it('rejects a wrong secret of a different length with 401', async () => {
    const response = await handlerFor().route(post('Bearer secret-but-much-longer'))
    expect(response.status).toBe(401)
  })

  it('rejects a wrong secret of the same length with 401', async () => {
    const response = await handlerFor().route(post('Bearer secreT'))
    expect(response.status).toBe(401)
  })

  it('rejects a missing header with 401', async () => {
    const response = await handlerFor().route(post(''))
    expect(response.status).toBe(401)
  })

  it('rejects an empty configured secret with 401', async () => {
    const response = await handlerFor({ secret: '' }).route(post('Bearer '))
    expect(response.status).toBe(401)
  })
})

describe('createCache body size', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', async () => {
    // Six code units, twelve UTF-8 bytes: over an 8-byte limit although the string is short.
    const response = await handlerFor({ maxBodyBytes: 8 }).route(
      post('Bearer secret', 'ź'.repeat(6)),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Request body too large' })
  })

  it('stops reading the body as soon as it exceeds the limit', async () => {
    let chunksRead = 0
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          chunksRead += 1
          if (chunksRead <= 3) controller.enqueue(new TextEncoder().encode('12345'))
          else controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const request = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body,
      // Bun's Request requires this when the body is a ReadableStream.
      duplex: 'half',
    } as RequestInit)

    const response = await handlerFor({ maxBodyBytes: 8 }).route(request)

    expect(response.status).toBe(400)
    expect(chunksRead).toBe(2)
  })
})
