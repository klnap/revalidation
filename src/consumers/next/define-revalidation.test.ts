import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Webhook } from 'standardwebhooks'
import { payloadSchema, payloadSource } from '../../sources/payload/index.js'

const revalidateTag = mock(() => {})
const revalidatePath = mock(() => {})
mock.module('next/cache.js', () => ({ revalidateTag, revalidatePath }))
const { defineRevalidation } = await import('./index.js')

const secret = `whsec_${Buffer.from('consumer-test-secret').toString('base64')}`

const signedRequest = (body: unknown, contentType = 'application/cloudevents+json') => {
  const raw = JSON.stringify(body)
  const id = 'wh_delivery_1'
  const timestamp = new Date()
  return new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': new Webhook(secret).sign(id, timestamp, raw),
    },
    body: raw,
  })
}

const event = (data: unknown, source = payloadSource) => ({
  specversion: '1.0',
  id: 'rev_1',
  source,
  type: 'com.klnap.revalidation.resource.changed.v1',
  datacontenttype: 'application/json',
  data,
})

const makeConsumer = () =>
  defineRevalidation({
    secret,
    sources: { [payloadSource]: payloadSchema },
    tags: { page: '[locale]:page:[slug]' },
    paths: { page: '/[locale]/[slug]' },
    rules: ({ tags, paths, on }) => [
      on(
        {
          source: payloadSource,
          affected: { type: 'payload.collection', name: 'pages' },
        },
        ({ affected }) => ({
          tags: affected.flatMap(({ resource }) =>
            resource.locale && resource.slug
              ? [tags.page({ locale: resource.locale, slug: resource.slug })]
              : [],
          ),
          paths: affected.flatMap(({ resource }) =>
            resource.locale && resource.slug
              ? [paths.page({ locale: resource.locale, slug: resource.slug })]
              : [],
          ),
        }),
      ),
    ],
  })

beforeEach(() => {
  revalidateTag.mockClear()
  revalidatePath.mockClear()
})

describe('defineRevalidation', () => {
  it('builds typed cache helpers and executes matching rules', async () => {
    const { tags, paths, POST } = makeConsumer()

    expect(tags.page({ locale: 'en', slug: 'home' })).toBe('en:page:home')
    expect(paths.page({ locale: 'en', slug: 'home' })).toBe('/en/home')

    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages', locale: 'en', slug: 'home' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'en', slug: 'home' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith('en:page:home', { expire: 0 })
    expect(revalidatePath).toHaveBeenCalledWith('/en/home')
  })

  it('validates the whole batch before running any cache operation', async () => {
    const { POST } = makeConsumer()
    const response = await POST(
      signedRequest(
        [
          event({
            operation: 'update',
            resource: { type: 'payload.collection', name: 'pages' },
            affected: [],
          }),
          { ...event({ operation: 'invalid', resource: {}, affected: [] }), id: 'rev_2' },
        ],
        'application/cloudevents-batch+json',
      ),
    )

    expect(response.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('combines object mappings and on rules with sequential custom execution', async () => {
    const order: string[] = []
    revalidateTag.mockImplementation(() => {
      order.push('next')
    })
    const { POST } = defineRevalidation({
      secret,
      sources: { [payloadSource]: payloadSchema },
      tags: { page: '[locale]:page:[slug]' },
      rules: ({ tags, on }) => [
        {
          'payload.collection': {
            pages: ({ affected }) => ({
              operations: [
                ...affected.map(({ resource }) => ({
                  layer: 'index',
                  value: { id: resource.id, slug: resource.slug },
                })),
                ...affected.map(({ resource }) => ({
                  layer: 'index',
                  value: { id: resource.id, slug: resource.slug },
                })),
              ],
              tags: affected.flatMap(({ resource }) =>
                resource.locale && resource.slug
                  ? [tags.page({ locale: resource.locale, slug: resource.slug })]
                  : [],
              ),
            }),
          },
        },
        on(
          {
            source: payloadSource,
            affected: { type: 'payload.collection', name: 'categories' },
          },
          () => ({ tags: [tags.page({ locale: 'en', slug: 'category-list' })] }),
        ),
      ],
      execute: {
        index: async ({ value, data, affected }) => {
          order.push(`index:${JSON.stringify(value)}:${data.operation}:${affected.length}`)
        },
      },
    })

    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages' },
          affected: [
            {
              operation: 'update',
              resource: {
                type: 'payload.collection',
                name: 'pages',
                id: 'page-1',
                locale: 'en',
                slug: 'guide',
              },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'categories', id: 'category-1' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(order).toEqual(['index:{"id":"page-1","slug":"guide"}:update:1', 'next', 'next'])
    revalidateTag.mockImplementation(() => {})
    expect(revalidateTag).toHaveBeenCalledWith('en:page:guide', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith('en:page:category-list', { expire: 0 })
    expect(await response.json()).toMatchObject({
      results: [
        { layer: 'index', status: 'success' },
        { layer: 'index', status: 'success' },
        { layer: 'next', status: 'success' },
        { layer: 'next', status: 'success' },
      ],
    })
  })

  it('skips a rule’s Next.js operations after custom failure but continues independent rules', async () => {
    const search = mock(() => {})
    const { POST } = defineRevalidation({
      secret,
      sources: { [payloadSource]: payloadSchema },
      tags: { page: '[slug]' },
      rules: ({ tags, on }) => [
        on(
          { source: payloadSource, affected: { type: 'payload.collection', name: 'pages' } },
          () => ({
            operations: [
              { layer: 'index', value: { id: 'page-1' } },
              { layer: 'search', value: { id: 'page-1' } },
            ],
            tags: [tags.page({ slug: 'page' })],
          }),
        ),
        on(
          { source: payloadSource, affected: { type: 'payload.collection', name: 'categories' } },
          () => ({ tags: [tags.page({ slug: 'categories' })] }),
        ),
      ],
      execute: {
        index: () => {
          throw new Error('private index details')
        },
        search,
      },
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', id: 'page-1' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'categories', id: 'category-1' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(500)
    const body = await response.text()
    expect(body).not.toContain('private index details')
    expect(revalidateTag).toHaveBeenCalledWith('categories', { expire: 0 })
    expect(JSON.parse(body)).toMatchObject({
      results: [
        { layer: 'index', status: 'failed', error: { code: 'CUSTOM_EXECUTION_FAILED' } },
        { layer: 'search', status: 'skipped', error: { code: 'DEPENDENCY_FAILED' } },
        { layer: 'next', status: 'skipped', error: { code: 'DEPENDENCY_FAILED' } },
        { layer: 'next', status: 'success' },
      ],
    })
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects invalid signatures and non-POST methods', async () => {
    const { POST } = makeConsumer()
    const badSignature = signedRequest(event({}), 'application/cloudevents+json')
    badSignature.headers.set('webhook-signature', 'v1,invalid')

    expect((await POST(badSignature)).status).toBe(401)
    expect(
      (await POST(new Request('http://localhost/api/revalidate', { method: 'GET' }))).status,
    ).toBe(405)
  })

  it('cancels a stalled unauthenticated body after the configured read deadline', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
      },
      cancel() {
        cancelled = true
      },
    })
    const { POST } = defineRevalidation({
      secret,
      sources: { [payloadSource]: payloadSchema },
      bodyTimeoutMs: 5,
      rules: () => ({}),
    })
    const request = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/cloudevents+json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    expect((await POST(request)).status).toBe(408)
    expect(cancelled).toBe(true)
  })

  it('bounds custom operations and aborts an executor that exceeds its deadline', async () => {
    const controllerSignals: AbortSignal[] = []
    const { POST } = defineRevalidation({
      secret,
      sources: { [payloadSource]: payloadSchema },
      executionTimeoutMs: 5,
      maxOperations: 1,
      rules: ({ on }) => [
        on({ source: payloadSource }, () => ({
          operations: [
            { layer: 'index', value: 'one' },
            { layer: 'index', value: 'two' },
          ],
        })),
      ],
      execute: {
        index: ({ signal }) => {
          controllerSignals.push(signal)
          return new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve(), { once: true }),
          )
        },
      },
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages' },
          affected: [],
        }),
      ),
    )

    expect(response.status).toBe(413)
    expect(controllerSignals).toHaveLength(0)
  })

  it('aborts a running custom operation at the configured execution deadline', async () => {
    const controllerSignals: AbortSignal[] = []
    let stoppedCooperatively = false
    const { POST } = defineRevalidation({
      secret,
      sources: { [payloadSource]: payloadSchema },
      executionTimeoutMs: 5,
      rules: ({ on }) => [
        on({ source: payloadSource }, () => ({
          operations: [{ layer: 'index', value: 'one' }],
        })),
      ],
      execute: {
        index: ({ signal }) => {
          controllerSignals.push(signal)
          return new Promise<void>((resolve) =>
            signal.addEventListener(
              'abort',
              () => {
                stoppedCooperatively = true
                resolve()
              },
              { once: true },
            ),
          )
        },
      },
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages' },
          affected: [],
        }),
      ),
    )

    expect(response.status).toBe(500)
    expect(controllerSignals[0]?.aborted).toBe(true)
    expect(stoppedCooperatively).toBe(true)
    expect(await response.json()).toMatchObject({
      results: [{ layer: 'index', status: 'failed', error: { code: 'CUSTOM_EXECUTION_TIMEOUT' } }],
    })
  })

  it('does not claim an uncooperative executor was cancelled or run dependent work after timeout', async () => {
    let rejectLate!: (error: Error) => void
    let signal: AbortSignal | undefined
    const search = mock(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const { POST } = defineRevalidation({
        secret,
        sources: { [payloadSource]: payloadSchema },
        executionTimeoutMs: 5,
        rules: ({ on }) => [
          on({ source: payloadSource }, () => ({
            operations: [
              { layer: 'index', value: 'product-1' },
              { layer: 'search', value: 'product-1' },
            ],
            tags: ['product:product-1'],
          })),
        ],
        execute: {
          index: ({ signal: executorSignal }) => {
            signal = executorSignal
            return new Promise<void>((_resolve, reject) => {
              rejectLate = reject
            })
          },
          search,
        },
      })
      const response = await POST(
        signedRequest(
          event({
            operation: 'update',
            resource: { type: 'payload.collection', name: 'products' },
            affected: [],
          }),
        ),
      )
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(signal?.aborted).toBe(true)
      expect(body).toMatchObject({
        results: [
          { layer: 'index', status: 'failed', error: { code: 'CUSTOM_EXECUTION_TIMEOUT' } },
          { layer: 'search', status: 'skipped', error: { code: 'DEPENDENCY_FAILED' } },
          { layer: 'next', status: 'skipped', error: { code: 'DEPENDENCY_FAILED' } },
        ],
      })
      expect(search).not.toHaveBeenCalled()
      expect(revalidateTag).not.toHaveBeenCalled()

      rejectLate(new Error('late executor rejection'))
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(unhandled).toEqual([])
      expect(body.results[0]).toMatchObject({
        layer: 'index',
        status: 'failed',
        error: { code: 'CUSTOM_EXECUTION_TIMEOUT' },
      })
      expect(search).not.toHaveBeenCalled()
      expect(revalidateTag).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('keeps timeout outcomes and dependent skips after an uncooperative operation resolves late', async () => {
    let resolveLate!: () => void
    const search = mock(() => {})
    const { POST } = defineRevalidation({
      secret,
      sources: { [payloadSource]: payloadSchema },
      executionTimeoutMs: 5,
      rules: ({ on }) => [
        on({ source: payloadSource }, () => ({
          operations: [
            { layer: 'index', value: 'product-1' },
            { layer: 'search', value: 'product-1' },
          ],
          tags: ['product:product-1'],
        })),
      ],
      execute: {
        index: () =>
          new Promise<void>((resolve) => {
            resolveLate = resolve
          }),
        search,
      },
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'products' },
          affected: [],
        }),
      ),
    )
    const body = await response.json()

    resolveLate()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      results: [
        { layer: 'index', status: 'failed', error: { code: 'CUSTOM_EXECUTION_TIMEOUT' } },
        { layer: 'search', status: 'skipped', error: { code: 'DEPENDENCY_FAILED' } },
        { layer: 'next', status: 'skipped', error: { code: 'DEPENDENCY_FAILED' } },
      ],
    })
    expect(search).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
