import { afterEach, describe, expect, it, mock } from 'bun:test'
import { Webhook } from 'standardwebhooks'
import { http } from '../../../src/dispatchers/http/index.ts'
import type { CloudEvent } from '../../../src/core/cloudevents.ts'

const secret = `whsec_${Buffer.from('test-secret').toString('base64')}`
const event = (id: string, operation = 'update'): CloudEvent => ({
  specversion: '1.0',
  id: `rev_${id}`,
  source: 'urn:test:cms',
  type: 'com.test.resource.changed.v1',
  datacontenttype: 'application/json',
  data: {
    operation,
    resource: { type: 'payload.collection', name: 'pages' },
    affected: [{ operation, resource: { type: 'payload.collection', name: 'pages' } }],
  },
})

afterEach(() => mock.restore())

describe('http dispatcher', () => {
  it('signs one event using Standard Webhooks headers and raw JSON bytes', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 202 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await http({
      targets: { website: { url: 'https://example.test/revalidate', secret } },
    }).dispatch({ events: [event('one')] })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    const webhook = new Webhook(secret)
    expect(url).toBe('https://example.test/revalidate')
    expect(headers.get('content-type')).toBe('application/cloudevents+json')
    expect(headers.get('webhook-id')).toMatch(/^wh_/)
    expect(() =>
      webhook.verify(init.body as string, {
        'webhook-id': headers.get('webhook-id')!,
        'webhook-timestamp': headers.get('webhook-timestamp')!,
        'webhook-signature': headers.get('webhook-signature')!,
      }),
    ).not.toThrow()
    expect(result).toMatchObject({
      status: 'accepted',
      results: [{ target: 'website', status: 'accepted', attempts: 1 }],
    })
  })

  it('filters each target before ordered batch chunking', async () => {
    const sent: { url: string; contentType: string; events: CloudEvent[] }[] = []
    globalThis.fetch = mock(async (input, init) => {
      const headers = new Headers(init?.headers)
      const body = JSON.parse(String(init?.body))
      sent.push({
        url: String(input),
        contentType: headers.get('content-type')!,
        events: Array.isArray(body) ? body : [body],
      })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const nonMatching = {
      ...event('ignored'),
      data: {
        operation: 'update',
        resource: { type: 'payload.collection', name: 'products' },
        affected: [
          {
            operation: 'update',
            resource: { type: 'payload.collection', name: 'products' },
          },
        ],
      },
    }

    const result = await http({
      maxEventItems: 2,
      targets: {
        all: { url: 'https://all.test', secret },
        pages: {
          url: 'https://pages.test',
          secret,
          filter: { affected: { type: 'payload.collection', name: 'pages' } },
        },
      },
    }).dispatch({
      events: [event('1'), nonMatching, event('2'), event('3', 'delete')],
      targets: ['pages'],
    })

    expect(sent).toEqual([
      {
        url: 'https://pages.test',
        contentType: 'application/cloudevents-batch+json',
        events: [event('1'), event('2')],
      },
      {
        url: 'https://pages.test',
        contentType: 'application/cloudevents+json',
        events: [event('3', 'delete')],
      },
    ])
    expect(result.status).toBe('accepted')
  })

  it('fans out independently and reports partial outcomes', async () => {
    const calls: string[] = []
    globalThis.fetch = mock(async (input) => {
      calls.push(String(input))
      return new Response(null, { status: String(input).includes('bad') ? 400 : 204 })
    }) as unknown as typeof fetch

    const result = await http({
      targets: {
        good: { url: 'https://good.test', secret },
        bad: { url: 'https://bad.test', secret },
      },
    }).dispatch({ events: [event('one')] })

    expect(calls.sort()).toEqual(['https://bad.test', 'https://good.test'])
    expect(result).toMatchObject({
      status: 'partial',
      results: [
        { target: 'good', status: 'accepted' },
        { target: 'bad', status: 'rejected' },
      ],
    })
  })

  it('rejects an unknown explicit target without making a request', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await http({
      targets: { website: { url: 'https://example.test', secret } },
    }).dispatch({ events: [event('one')], targets: ['missing'] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'rejected',
      results: [{ target: 'missing', status: 'rejected', attempts: 0 }],
    })
  })

  it('retries with a stable body and delivery ID but fresh signature timestamps', async () => {
    const attempts: { body: string; id: string; timestamp: string; signature: string }[] = []
    globalThis.fetch = mock(async (_input, init) => {
      const headers = new Headers(init?.headers)
      attempts.push({
        body: String(init?.body),
        id: headers.get('webhook-id')!,
        timestamp: headers.get('webhook-timestamp')!,
        signature: headers.get('webhook-signature')!,
      })
      return new Response(null, { status: attempts.length === 1 ? 503 : 204 })
    }) as unknown as typeof fetch

    const result = await http({
      retries: 1,
      retryDelayMs: 1,
      targets: { website: { url: 'https://example.test', secret } },
    }).dispatch({ events: [event('one')] })

    expect(attempts).toHaveLength(2)
    expect(attempts[1]!.body).toBe(attempts[0]!.body)
    expect(attempts[1]!.id).toBe(attempts[0]!.id)
    expect(attempts[1]!.timestamp).not.toBe(attempts[0]!.timestamp)
    expect(attempts[1]!.signature).not.toBe(attempts[0]!.signature)
    expect(result).toMatchObject({ status: 'accepted', results: [{ attempts: 2 }] })
  })

  it('names the target and distinguishes missing from malformed signing secrets', () => {
    const url = 'https://example.test/revalidate'
    expect(() =>
      http({ targets: { website: { url, secret: undefined as unknown as string } } }),
    ).toThrow('HTTP target "website" is missing its signing secret')
    expect(() => http({ targets: { website: { url, secret: 'plain-token' } } })).toThrow(
      'HTTP target "website" has a malformed signing secret',
    )
    expect(() => http({ targets: { website: { url, secret: 'whsec_!!!not-base64' } } })).toThrow(
      'HTTP target "website" has a malformed signing secret',
    )
  })

  it('validates HTTPS targets and bounded event chunk sizes at configuration time', () => {
    expect(() => http({ targets: {} })).toThrow()
    expect(() => http({ targets: { website: { url: 'ftp://example.test', secret } } })).toThrow()
    expect(() => http({ targets: { website: { url: 'http://example.test', secret } } })).toThrow()
    for (const retries of [-1, 11, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        http({ targets: { website: { url: 'https://example.test', secret } }, retries }),
      ).toThrow()
    }
    expect(() =>
      http({ targets: { website: { url: 'https://example.test', secret } }, retryDelayMs: -1 }),
    ).toThrow()
    expect(() =>
      http({ targets: { website: { url: 'https://example.test', secret } }, timeoutMs: 60_001 }),
    ).toThrow()
    expect(() =>
      http({
        targets: { website: { url: 'https://example.test', secret } },
        maxEventItems: 1001,
      }),
    ).toThrow()
  })

  it('retries 429 responses and stops at the dispatch deadline', async () => {
    let retryCalls = 0
    globalThis.fetch = mock(async () => {
      retryCalls += 1
      return new Response(null, { status: retryCalls === 1 ? 429 : 204 })
    }) as unknown as typeof fetch
    const retried = await http({
      retries: 1,
      retryDelayMs: 0,
      targets: { website: { url: 'https://example.test', secret } },
    }).dispatch({ events: [event('retry')] })
    expect(retried).toMatchObject({ status: 'accepted', results: [{ attempts: 2 }] })

    const deadlineFetch = mock(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')))
        }),
    )
    globalThis.fetch = deadlineFetch as unknown as typeof fetch
    const deadline = await http({
      timeoutMs: 100,
      deadlineMs: 10,
      retries: 10,
      retryDelayMs: 0,
      targets: { website: { url: 'https://example.test', secret } },
    }).dispatch({ events: [event('deadline')] })
    expect(deadline).toMatchObject({ status: 'unknown', results: [{ attempts: 1 }] })
  })

  it('does not send a single event larger than the configured body limit', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const result = await http({
      maxBodyBytes: 100,
      targets: { website: { url: 'https://example.test', secret } },
    }).dispatch({ events: [event('large', 'x'.repeat(200))] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'failed',
      results: [{ target: 'website', attempts: 0, error: { code: 'HTTP_BODY_TOO_LARGE' } }],
    })
  })

  it('keeps every batch within the encoded body limit', async () => {
    const sent: string[] = []
    globalThis.fetch = mock(async (_input, init) => {
      sent.push(String(init?.body))
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const maxBodyBytes = new TextEncoder().encode(
      JSON.stringify([event('1'), event('2')]),
    ).byteLength

    const result = await http({
      maxBodyBytes,
      targets: { website: { url: 'https://example.test', secret } },
    }).dispatch({ events: ['1', '2', '3', '4', '5'].map((id) => event(id)) })

    expect(result.status).toBe('accepted')
    expect(sent).toHaveLength(3)
    expect(sent.every((body) => new TextEncoder().encode(body).byteLength <= maxBodyBytes)).toBe(
      true,
    )
    expect(
      sent.map((body) => (Array.isArray(JSON.parse(body)) ? JSON.parse(body).length : 1)),
    ).toEqual([2, 2, 1])
  })
})
