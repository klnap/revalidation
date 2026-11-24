import { describe, expect, it, mock } from 'bun:test'

import { http } from '../../../src/dispatchers/http'
import {
  resetRevalidationPluginTarget,
  resolveRevalidationTargets,
  setRevalidationPluginTarget,
} from '../../../src/dispatchers/routing/resolve-target'

describe('resolveRevalidationTargets', () => {
  it('inherits plugin target when factory omits target', () => {
    setRevalidationPluginTarget({ url: 'http://plugin', secret: 'p' })
    expect(resolveRevalidationTargets()).toEqual([{ url: 'http://plugin', secret: 'p' }])
    resetRevalidationPluginTarget()
  })

  it('prefers factory target over plugin target', () => {
    setRevalidationPluginTarget({ url: 'http://plugin', secret: 'p' })
    expect(resolveRevalidationTargets({ url: 'http://local', secret: 'l' })).toEqual([
      { url: 'http://local', secret: 'l' },
    ])
    resetRevalidationPluginTarget()
  })
})

describe('http dispatcher', () => {
  it('POSTs event JSON with bearer auth', async () => {
    const fetchMock = mock(async () => ({ ok: true, status: 200, statusText: 'OK' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    setRevalidationPluginTarget({
      url: 'http://frontend.test/api/revalidate',
      secret: 'secret',
    })

    const dispatcher = http()
    const outcome = await dispatcher.dispatch({
      events: [{ source: 'cms', data: [{ slug: 'pages' }] }],
    })

    expect(outcome.status).toBe('accepted')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://frontend.test/api/revalidate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
          'X-Revalidation-Delivery': expect.any(String),
        },
        body: JSON.stringify({ source: 'cms', data: [{ slug: 'pages' }] }),
      }),
    )

    resetRevalidationPluginTarget()
  })

  it('returns failed when no target is configured', async () => {
    resetRevalidationPluginTarget()
    const outcome = await http().dispatch({ events: [{ source: 'x', data: [] }] })
    expect(outcome.status).toBe('failed')
  })

  it('dispatches to every target', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const dispatcher = http({
      target: [
        { url: 'http://a.test/revalidate', secret: 'a' },
        { url: 'http://b.test/revalidate', secret: 'b' },
      ],
    })
    await dispatcher.dispatch({ events: [{ source: 'cms', data: [] }] })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    resetRevalidationPluginTarget()
  })

  it('caps concurrent event deliveries at four', async () => {
    let active = 0
    let peak = 0
    globalThis.fetch = mock(async () => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
      return { ok: true, status: 200, statusText: 'OK' }
    }) as unknown as typeof fetch

    const outcome = await http({
      target: { url: 'http://x', secret: 'y' },
      deadlineMs: 1_000,
    }).dispatch({
      events: Array.from({ length: 12 }, () => ({ source: 'cms', data: [] })),
    })

    expect(outcome.status).toBe('accepted')
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBe(4)
  })

  it('returns failed when any target fails', async () => {
    globalThis.fetch = mock(async (url: string) => ({
      ok: !url.includes('b.test'),
      status: url.includes('b.test') ? 502 : 200,
      statusText: url.includes('b.test') ? 'Bad Gateway' : 'OK',
    })) as unknown as typeof fetch

    const dispatcher = http({
      target: [
        { url: 'http://a.test/revalidate', secret: 'a' },
        { url: 'http://b.test/revalidate', secret: 'b' },
      ],
    })

    const outcome = await dispatcher.dispatch({ events: [{ source: 'cms', data: [] }] })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') {
      expect(outcome.error.message).toMatch(/failed/)
    }
  })

  it('returns failed on non-ok HTTP response', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })) as unknown as typeof fetch

    setRevalidationPluginTarget({ url: 'http://x', secret: 'y' })

    const outcome = await http().dispatch({ events: [{ source: 'cms', data: [] }] })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') {
      expect(outcome.error.message).toMatch(/HTTP 503/)
    }

    resetRevalidationPluginTarget()
  })

  it('does not include target URL query secrets in failures', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 503,
      statusText: 'token=private',
    })) as unknown as typeof fetch

    const outcome = await http({
      target: { url: 'http://x/revalidate?token=private', secret: 'secret' },
      retries: 0,
    }).dispatch({ events: [{ source: 'cms', data: [] }] })

    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') {
      expect(outcome.error.message).not.toContain('private')
    }
  })

  it('retries a 5xx up to the bound, then fails with the attempt count', async () => {
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls += 1
      return { ok: false, status: 500, statusText: 'Internal Server Error' }
    }) as unknown as typeof fetch

    setRevalidationPluginTarget({ url: 'http://x', secret: 'y' })

    const outcome = await http({ retryDelayMs: 1 }).dispatch({
      events: [{ source: 'cms', data: [] }],
    })
    expect(outcome.status).toBe('failed')
    expect(calls).toBe(3)
    expect(outcome.status === 'failed' && outcome.error.message).toContain('attempts: 3/3')

    resetRevalidationPluginTarget()
  })

  it('does not retry a 4xx response', async () => {
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls += 1
      return { ok: false, status: 401, statusText: 'Unauthorized' }
    }) as unknown as typeof fetch

    setRevalidationPluginTarget({ url: 'http://x', secret: 'y' })

    const outcome = await http({ retryDelayMs: 1 }).dispatch({
      events: [{ source: 'cms', data: [] }],
    })
    expect(outcome.status).toBe('failed')
    expect(calls).toBe(1)

    resetRevalidationPluginTarget()
  })

  it('accepts after a transient 503 and reuses one delivery id across attempts', async () => {
    const deliveries: string[] = []
    let calls = 0
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      calls += 1
      const headers = (init?.headers ?? {}) as Record<string, string>
      deliveries.push(headers['X-Revalidation-Delivery'] ?? '')
      return calls < 3
        ? { ok: false, status: 503, statusText: 'Service Unavailable' }
        : { ok: true, status: 200, statusText: 'OK' }
    }) as unknown as typeof fetch

    setRevalidationPluginTarget({ url: 'http://x', secret: 'y' })

    const outcome = await http({ retryDelayMs: 1 }).dispatch({
      events: [{ source: 'cms', data: [] }],
      deduplicationId: 'delivery-1',
    })
    expect(outcome.status).toBe('accepted')
    expect(calls).toBe(3)
    expect(new Set(deliveries)).toEqual(new Set(['delivery-1:0']))

    resetRevalidationPluginTarget()
  })

  it('aborts after timeoutMs and reports a timed-out failure', async () => {
    globalThis.fetch = mock(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    ) as unknown as typeof fetch

    setRevalidationPluginTarget({ url: 'http://x', secret: 'y' })

    const outcome = await http({ timeoutMs: 20 }).dispatch({
      events: [{ source: 'cms', data: [] }],
    })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') {
      expect(outcome.error.message).toMatch(/timed out/)
    }

    resetRevalidationPluginTarget()
  })
})

describe('http dispatcher bounds', () => {
  it('returns a failed outcome within the deadline when fetch never resolves', async () => {
    let requestSignal: AbortSignal | undefined
    globalThis.fetch = mock((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise(() => undefined)
    }) as unknown as typeof fetch

    const started = Date.now()
    const outcome = await http({
      target: { url: 'http://x', secret: 'y' },
      deadlineMs: 30,
    }).dispatch({
      events: [{ source: 'cms', data: [] }],
    })
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(requestSignal?.aborted).toBe(true)
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') {
      expect(outcome.error.message).toContain('dispatch deadline of 30 ms exceeded')
      expect(outcome.error.message).not.toContain('y')
    }
  })

  it('cancels the response body of a 500 before retrying', async () => {
    const cancel = mock(async () => undefined)
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: { cancel },
    })) as unknown as typeof fetch

    await http({ target: { url: 'http://x', secret: 'y' }, retries: 1, retryDelayMs: 1 }).dispatch({
      events: [{ source: 'cms', data: [] }],
    })
    expect(cancel).toHaveBeenCalledTimes(2)
  })

  it('allows plain http only to loopback hosts outside development and test', async () => {
    const previous = process.env.NODE_ENV
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = 'production'
    const fetchMock = mock(async () => ({ ok: true, status: 200, statusText: 'OK' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const event = { events: [{ source: 'cms', data: [] }] }
      expect(
        (
          await http({
            target: { url: 'http://localhost:3000/api/revalidate', secret: 's' },
          }).dispatch(event)
        ).status,
      ).toBe('accepted')
      expect(
        (
          await http({
            target: { url: 'http://127.0.0.1:3000/api/revalidate', secret: 's' },
          }).dispatch(event)
        ).status,
      ).toBe('accepted')
      expect(
        (
          await http({ target: { url: 'http://[::1]:3000/api/revalidate', secret: 's' } }).dispatch(
            event,
          )
        ).status,
      ).toBe('accepted')

      const refused = await http({
        target: { url: 'http://frontend.example/api/revalidate', secret: 's' },
      }).dispatch(event)
      expect(refused.status).toBe('failed')
      expect(fetchMock).toHaveBeenCalledTimes(3)

      const allowed = await http({
        target: { url: 'http://frontend.example/api/revalidate', secret: 's' },
        allowInsecure: true,
      }).dispatch(event)
      expect(allowed.status).toBe('accepted')
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      env.NODE_ENV = previous
    }
  })

  it('does not follow a redirect and reports it as a failed outcome', async () => {
    const fetchMock = mock(async (_url: string, _init?: RequestInit) => ({
      ok: false,
      status: 302,
      statusText: 'Found',
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const outcome = await http({ target: { url: 'https://x.test', secret: 'y' } }).dispatch({
      events: [{ source: 'cms', data: [] }],
    })
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.error.message).toContain('redirect refused')
  })

  it('refuses a plain http target outside development and test', async () => {
    const env = process.env as Record<string, string | undefined>
    const previous = env.NODE_ENV
    env.NODE_ENV = 'production'
    const fetchMock = mock(async () => ({ ok: true, status: 200, statusText: 'OK' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const outcome = await http({ target: { url: 'http://x.test', secret: 'y' } }).dispatch({
        events: [{ source: 'cms', data: [] }],
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(outcome.status).toBe('failed')
    } finally {
      env.NODE_ENV = previous
    }
  })
})

describe('http dispatcher chunk size', () => {
  it('defaults to 100 items per event and exposes it to the producer', () => {
    expect(http().maxEventItems).toBe(100)
  })

  it('accepts a chunk size up to 1000', () => {
    expect(http({ maxEventItems: 1000 }).maxEventItems).toBe(1000)
  })

  it('rejects a chunk size above 1000 or below 1 at configuration time', () => {
    expect(() => http({ maxEventItems: 1001 })).toThrow(RangeError)
    expect(() => http({ maxEventItems: 0 })).toThrow(RangeError)
  })
})
