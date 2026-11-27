import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Webhook } from 'standardwebhooks'
import * as v from 'valibot'
import { resourceChangedEventType } from '../../core/resource-changed-schema.js'

const revalidateTag = mock((_tag: string, _profile: unknown) => {})
const revalidatePath = mock((_path: string, _type?: string) => {})
mock.module('next/cache.js', () => ({ revalidateTag, revalidatePath }))
const { defineRevalidation } = await import('./index.js')

const secret = `whsec_${Buffer.from('consumer-test-secret').toString('base64')}`
const source = 'https://cms.example/revalidation'

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

const event = (data: unknown, eventSource = source) => ({
  specversion: '1.0',
  id: 'rev_1',
  source: eventSource,
  type: 'com.klnap.revalidation.resource.changed.v1',
  datacontenttype: 'application/json',
  data,
})

const makeConsumer = () =>
  defineRevalidation({
    secret,
    tags: { page: '[locale]:page:[slug]' },
    paths: { page: '/[locale]/[slug]' },
    rules: ({ tags, paths, on }) => [
      on(
        {
          type: resourceChangedEventType,
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
  it('uses the built-in resource-change schema and applies declarative rules to old and new identifiers', async () => {
    const { tags, paths, POST } = defineRevalidation({
      secret,
      tags: {
        projects: '[locale]:projects',
        project: '[locale]:project:[slug]',
        homepage: '[locale]:homepage',
      },
      paths: { project: '/[locale]/work/[slug]' },
      rules: ({ tags, paths }) => ({
        'payload.collection.projects': {
          tags: [tags.projects, tags.project, tags.homepage],
          paths: [paths.project],
        },
      }),
    })

    expect(tags.project({ locale: 'pl', slug: 'example' })).toBe('pl:project:example')
    expect(paths.project({ locale: 'pl', slug: 'example' })).toBe('/pl/work/example')

    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'projects', locale: 'pl', slug: 'new' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'projects', locale: 'pl', slug: 'old' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'projects', locale: 'pl', slug: 'new' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'projects', locale: 'pl', slug: 'old' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(revalidateTag.mock.calls.map(([tag]) => tag)).toEqual([
      'pl:projects',
      'pl:project:old',
      'pl:project:new',
      'pl:homepage',
    ])
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/pl/work/old',
      '/pl/work/new',
    ])
  })

  it('expands flat mappings across previous and current identifiers and bounds cache planning', async () => {
    const { POST } = defineRevalidation({
      secret,
      maxOperations: 5,
      tags: {
        pages: '[locale]:pages',
        page: '[locale]:page:[slug]',
      },
      paths: { page: '/[locale]/[slug]' },
      rules: ({ tags, paths }) => ({
        'payload.collection.pages': {
          tags: [tags.pages, tags.page],
          paths: [paths.page],
        },
      }),
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'new' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'old' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'new' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(413)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('deduplicates flat mapping operations for old and current identifiers', async () => {
    const { POST } = defineRevalidation({
      secret,
      tags: {
        pages: '[locale]:pages',
        page: '[locale]:page:[slug]',
      },
      paths: { page: '/[locale]/[slug]' },
      rules: ({ tags, paths }) => ({
        'payload.collection.pages': {
          tags: [tags.pages, tags.page],
          paths: [paths.page],
        },
      }),
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'new' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'old' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'new' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: 'old' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(revalidateTag.mock.calls.map(([tag]) => tag)).toEqual([
      'pl:pages',
      'pl:page:old',
      'pl:page:new',
    ])
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(['/pl/old', '/pl/new'])
  })

  it('resolves global, rule, and per-tag profiles while expanding previous and current references', async () => {
    const { POST } = defineRevalidation({
      secret,
      profile: 'hours',
      tags: {
        articles: '[locale]:articles',
        article: '[locale]:article:[slug]',
        homepage: '[locale]:homepage',
        sitemap: 'sitemap',
        redirects: 'redirects',
      },
      rules: ({ tags }) => ({
        'payload.collection.articles': {
          profile: 'editorial',
          tags: [
            tags.articles,
            [tags.article, { expire: 0 }],
            tags.homepage,
            [tags.sitemap, { expire: 3600 }],
          ],
        },
        'payload.collection.redirects': [tags.redirects],
      }),
    })

    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'articles' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'articles', locale: 'en', slug: 'old' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'articles', locale: 'en', slug: 'new' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'redirects', locale: 'en' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(revalidateTag.mock.calls).toEqual([
      ['en:articles', 'editorial'],
      ['en:article:old', { expire: 0 }],
      ['en:article:new', { expire: 0 }],
      ['en:homepage', 'editorial'],
      ['sitemap', { expire: 3600 }],
      ['redirects', 'hours'],
    ])
  })

  it('rejects conflicting native profiles for one tag independently of batch order', async () => {
    const { POST } = defineRevalidation({
      secret,
      profile: 'max',
      tags: { homepage: 'homepage' },
      rules: ({ tags }) => ({
        'payload.collection.articles': { profile: 'max', tags: [tags.homepage] },
        'payload.global.navigation': { profile: { expire: 0 }, tags: [tags.homepage] },
      }),
    })
    const makeEvent = (id: string, resource: { type: string; name: string }) => ({
      ...event({
        operation: 'update',
        resource,
        affected: [{ operation: 'update', resource }],
      }),
      id,
    })
    const article = makeEvent('article-event', {
      type: 'payload.collection',
      name: 'articles',
    })
    const navigation = makeEvent('navigation-event', {
      type: 'payload.global',
      name: 'navigation',
    })

    for (const events of [
      [article, navigation],
      [navigation, article],
    ]) {
      revalidateTag.mockClear()
      const response = await POST(signedRequest(events, 'application/cloudevents-batch+json'))

      expect(response.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    }
  })

  it('rejects incomparable named profiles for one tag without calling Next.js', async () => {
    const { POST } = defineRevalidation({
      secret,
      tags: { homepage: 'homepage' },
      rules: ({ tags }) => ({
        'payload.collection.articles': { profile: 'hours', tags: [tags.homepage] },
        'payload.global.navigation': { profile: 'editorial', tags: [tags.homepage] },
      }),
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'articles' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'articles' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.global', name: 'navigation' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects profile conflicts before running a custom plan', async () => {
    const execute = mock(() => {
      throw new Error('index failed')
    })
    const { POST } = defineRevalidation({
      secret,
      tags: { homepage: 'homepage' },
      rules: ({ tags, on }) => [
        on(
          {
            type: resourceChangedEventType,
            affected: { type: 'payload.collection', name: 'articles' },
          },
          () => ({
            operations: [{ layer: 'index', value: 'article' }],
            tags: [[tags.homepage, { expire: 0 }]],
          }),
        ),
        on(
          {
            type: resourceChangedEventType,
            affected: { type: 'payload.global', name: 'navigation' },
          },
          () => ({ tags: [[tags.homepage, 'max']] }),
        ),
      ],
      execute: {
        index: execute,
      },
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'articles' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'articles' },
            },
            {
              operation: 'update',
              resource: { type: 'payload.global', name: 'navigation' },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('reports missing automatic template parameters without invalidating a malformed key', async () => {
    const { POST } = defineRevalidation({
      secret,
      paths: { page: '/[locale]/[slug]' },
      rules: ({ paths }) => ({
        'payload.collection.pages': { paths: [paths.page] },
      }),
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages' },
          affected: [
            { operation: 'update', resource: { type: 'payload.collection', name: 'pages' } },
          ],
        }),
      ),
    )

    expect(response.status).toBe(500)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      results: [
        {
          layer: 'next',
          operation: 'template',
          status: 'skipped',
          error: { code: 'MISSING_TEMPLATE_PARAM' },
        },
      ],
    })
  })

  it('rejects unsafe path parameters from affected resource data before invalidation', async () => {
    const { POST } = defineRevalidation({
      secret,
      paths: { page: '/[locale]/[slug]' },
      rules: ({ paths }) => ({
        'payload.collection.pages': { paths: [paths.page] },
      }),
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages', locale: 'pl', slug: '../private' },
          affected: [
            {
              operation: 'update',
              resource: {
                type: 'payload.collection',
                name: 'pages',
                locale: 'pl',
                slug: '../private',
              },
            },
          ],
        }),
      ),
    )

    expect(response.status).toBe(400)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

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

  it('rejects validly signed events with unregistered types before cache invalidation', async () => {
    const { POST } = makeConsumer()
    const response = await POST(
      signedRequest({
        ...event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages', locale: 'en', slug: 'home' },
          affected: [
            {
              operation: 'update',
              resource: { type: 'payload.collection', name: 'pages', locale: 'en', slug: 'home' },
            },
          ],
        }),
        type: 'com.example.unregistered.v1',
      }),
    )

    expect(response.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
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

  it('validates custom schemas by event type and enforces allowedSources before execution', async () => {
    const executed = mock((_value: unknown) => {})
    const { POST } = defineRevalidation({
      secret,
      schemas: { 'com.example.billing.changed.v1': v.object({ key: v.string() }) },
      allowedSources: [source],
      rules: ({ on }) => [
        on({ type: 'com.example.billing.changed.v1' }, ({ data }) => ({
          operations: [{ layer: 'index', value: data.key }],
        })),
      ],
      execute: { index: ({ value }) => executed(value) },
    })
    const allowed = event({ key: 'billing' })
    const customEvent = {
      ...allowed,
      type: 'com.example.billing.changed.v1',
    }

    expect((await POST(signedRequest(customEvent))).status).toBe(200)
    expect(executed).toHaveBeenCalledWith('billing')
    executed.mockClear()

    expect(
      (await POST(signedRequest({ ...customEvent, source: 'https://untrusted.example/events' })))
        .status,
    ).toBe(400)
    expect(executed).not.toHaveBeenCalled()
  })

  it('does not allow custom schemas to replace the built-in event contract', () => {
    expect(() =>
      defineRevalidation({
        secret,
        schemas: { [resourceChangedEventType]: v.object({ key: v.string() }) },
        rules: () => [],
      }),
    ).toThrow(`schema for ${resourceChangedEventType} is built in`)
  })

  it('deduplicates repeated event identities but executes equal IDs from distinct sources', async () => {
    const execute = mock(() => {})
    const { POST } = defineRevalidation({
      secret,
      rules: ({ on }) => [
        on({ type: resourceChangedEventType }, () => ({
          operations: [{ layer: 'index', value: 'page' }],
        })),
      ],
      execute: { index: execute },
    })
    const payload = {
      operation: 'update',
      resource: { type: 'payload.collection', name: 'pages' },
      affected: [],
    }
    const events = [
      { ...event(payload), id: 'same-id' },
      { ...event(payload), id: 'same-id' },
      { ...event(payload, 'https://other.example/revalidation'), id: 'same-id' },
    ]
    const response = await POST(signedRequest(events, 'application/cloudevents-batch+json'))

    expect(response.status).toBe(200)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('combines object mappings and on rules with sequential custom execution', async () => {
    const order: string[] = []
    revalidateTag.mockImplementation(() => {
      order.push('next')
    })
    const { POST } = defineRevalidation({
      secret,
      tags: { page: '[locale]:page:[slug]' },
      rules: ({ tags, on }) => [
        on(
          {
            type: resourceChangedEventType,
            affected: { type: 'payload.collection', name: 'pages' },
          },
          ({ affected }) => ({
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
        ),
        on(
          {
            type: resourceChangedEventType,
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
    expect(order).toEqual([
      'index:{"id":"page-1","slug":"guide"}:update:1',
      'index:{"id":"page-1","slug":"guide"}:update:1',
      'next',
      'next',
    ])
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
      tags: { page: '[slug]' },
      rules: ({ tags, on }) => [
        on(
          {
            type: resourceChangedEventType,
            affected: { type: 'payload.collection', name: 'pages' },
          },
          () => ({
            operations: [
              { layer: 'index', value: { id: 'page-1' } },
              { layer: 'search', value: { id: 'page-1' } },
            ],
            tags: [tags.page({ slug: 'page' })],
          }),
        ),
        on(
          {
            type: resourceChangedEventType,
            affected: { type: 'payload.collection', name: 'categories' },
          },
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

  it('inherits native tag profiles and passes literal route scopes without inferring types for URLs', async () => {
    const { POST } = defineRevalidation({
      secret,
      profile: 'global-profile',
      rules: ({ on }) => [
        on({ type: resourceChangedEventType }, () => ({
          profile: 'rule-profile',
          tags: [['one', 'tag-profile'], ['two'], 'three'],
          paths: ['/reports/concrete', ['/reports/[slug]', 'page'], ['/site', 'layout']],
        })),
      ],
    })
    const response = await POST(
      signedRequest(
        event({
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages' },
          affected: [
            { operation: 'update', resource: { type: 'payload.collection', name: 'pages' } },
          ],
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(revalidateTag.mock.calls).toEqual([
      ['one', 'tag-profile'],
      ['two', 'rule-profile'],
      ['three', 'rule-profile'],
    ])
    expect(revalidatePath.mock.calls).toEqual([
      ['/reports/concrete'],
      ['/reports/[slug]', 'page'],
      ['/site', 'layout'],
    ])
  })

  it('rejects conflicting tag profiles before custom or Next.js side effects', async () => {
    const execute = mock(() => {})
    const { POST } = defineRevalidation({
      secret,
      rules: ({ on }) => [
        on({ type: resourceChangedEventType }, () => ({
          tags: [['shared', 'first']],
          operations: [{ layer: 'index', value: 'one' }],
        })),
        on({ type: resourceChangedEventType }, () => ({ tags: [['shared', 'second']] })),
      ],
      execute: { index: execute },
    })
    const response = await POST(signedRequest(event({ operation: 'update', affected: [] })))

    expect(response.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
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
      executionTimeoutMs: 5,
      maxOperations: 1,
      rules: ({ on }) => [
        on({ type: resourceChangedEventType }, () => ({
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
      executionTimeoutMs: 5,
      rules: ({ on }) => [
        on({ type: resourceChangedEventType }, () => ({
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
        executionTimeoutMs: 5,
        rules: ({ on }) => [
          on({ type: resourceChangedEventType }, () => ({
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
      executionTimeoutMs: 5,
      rules: ({ on }) => [
        on({ type: resourceChangedEventType }, () => ({
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
