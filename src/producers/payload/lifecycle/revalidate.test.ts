import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { deferRevalidationUntilCommit } from './deferred.ts'
import {
  docsContentEqual,
  getOperation,
  getRequestLocale,
  hasLocaleData,
  isDraftSave,
  isPublishAllLocales,
  isUnpublishedStatus,
  type RevalidateArgs,
  resolveChangedLocales,
  shouldSkipDraftRevalidation,
  shouldSkipUnchangedLocale,
  shouldSkipUnpublishedLocaleDoc,
} from './helpers.ts'
import { runRevalidationHook as runHookUnflushed } from './revalidate.ts'

const baseReq = {
  query: {} as Record<string, unknown>,
  locale: 'en' as const,
  payload: {
    config: {
      localization: {
        locales: [
          { code: 'en', label: 'English' },
          { code: 'de', label: 'German' },
        ],
      },
    },
    logger: { error: mock(() => {}) },
  },
}

/** Runs the hook with an owner that dispatches after its transaction commits. */
const runCommitted = async (
  args: RevalidateArgs,
  dispatcher: Parameters<typeof runHookUnflushed>[1],
  options?: Parameters<typeof runHookUnflushed>[2],
) => {
  const req = {
    ...args.req,
    context: {},
  } as typeof args.req
  const deferral = deferRevalidationUntilCommit(req)
  await runHookUnflushed({ ...args, req }, dispatcher, options)
  await deferral.flush()
}

describe('hasLocaleData', () => {
  it('ignores technical keys and empty values', () => {
    expect(hasLocaleData({ id: '1', _status: 'published' })).toBe(false)
    expect(hasLocaleData({ id: '1', title: 'Hello' })).toBe(true)
    expect(hasLocaleData(undefined)).toBe(false)
  })
})

describe('docsContentEqual / shouldSkipUnchangedLocale', () => {
  it('ignores technical keys and key order', () => {
    expect(
      docsContentEqual(
        { id: '1', updatedAt: 'a', title: 'Hi', meta: { a: 1, b: 2 } },
        { meta: { b: 2, a: 1 }, title: 'Hi', id: '2', updatedAt: 'b' },
      ),
    ).toBe(true)
    expect(docsContentEqual({ title: 'Hi' }, { title: 'Bye' })).toBe(false)
  })

  it('ignores Lexical node ids regenerated on republish', () => {
    expect(
      docsContentEqual(
        {
          description: {
            root: {
              children: [{ id: 'aaa', type: 'text', text: 'Hallo' }],
            },
          },
        },
        {
          description: {
            root: {
              children: [{ id: 'bbb', type: 'text', text: 'Hallo' }],
            },
          },
        },
      ),
    ).toBe(true)
    expect(
      docsContentEqual(
        {
          description: {
            root: {
              children: [{ id: 'aaa', type: 'text', text: 'Hallo' }],
            },
          },
        },
        {
          description: {
            root: {
              children: [{ id: 'bbb', type: 'text', text: 'Tschüss' }],
            },
          },
        },
      ),
    ).toBe(false)
  })

  it('skips unchanged published content', () => {
    expect(
      shouldSkipUnchangedLocale({
        current: { title: 'Hi', _status: 'published' },
        previous: { title: 'Hi', _status: 'published' },
        operation: 'update',
      }),
    ).toBe(true)
  })

  it('does not skip when only _status changes (e.g. unpublish)', () => {
    expect(
      shouldSkipUnchangedLocale({
        current: { title: 'Hi', _status: { pl: 'draft', en: 'published' } },
        previous: { title: 'Hi', _status: { pl: 'published', en: 'published' } },
        operation: 'update',
      }),
    ).toBe(false)
  })

  it('does not skip draft→published even when content same', () => {
    expect(
      shouldSkipUnchangedLocale({
        current: { title: 'Hi', _status: 'published' },
        previous: { title: 'Hi', _status: 'draft' },
        operation: 'update',
      }),
    ).toBe(false)
  })

  it('does not skip when previous missing or content differs', () => {
    expect(
      shouldSkipUnchangedLocale({
        current: { title: 'Hi' },
        operation: 'update',
      }),
    ).toBe(false)
    expect(
      shouldSkipUnchangedLocale({
        current: { title: 'New' },
        previous: { title: 'Old' },
        operation: 'update',
      }),
    ).toBe(false)
    expect(
      shouldSkipUnchangedLocale({
        current: { title: 'Hi' },
        previous: { title: 'Hi' },
        operation: 'delete',
      }),
    ).toBe(false)
  })
})

describe('query flags', () => {
  it('detects publish-all and draft saves', () => {
    expect(isPublishAllLocales({ query: { publishAllLocales: 'true' } })).toBe(true)
    expect(isDraftSave({ query: { draft: 'true' } })).toBe(true)
    expect(isDraftSave({ query: { draft: true } })).toBe(true)
    expect(isDraftSave({ query: {} })).toBe(false)
  })
})

describe('getOperation / resolveChangedLocales', () => {
  it('defaults delete when operation is absent on collections', () => {
    const args = {
      req: baseReq,
      doc: { id: '1' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs

    expect(getOperation(args)).toBe('delete')
    expect(resolveChangedLocales({ args, locales: ['en', 'de'] })).toEqual(['en', 'de'])
  })

  it('treats global afterChange without operation as update', () => {
    const args = {
      req: { ...baseReq, locale: 'pl' },
      doc: { id: '1', title: 'Hello' },
      previousDoc: { id: '1', title: 'Old' },
      global: { slug: 'work-page' },
    } as unknown as RevalidateArgs

    expect(getOperation(args)).toBe('update')
    expect(resolveChangedLocales({ args, locales: ['pl', 'en', 'de'] })).toEqual(['pl'])
  })

  it('uses publishSpecificLocale when req.locale is all', () => {
    const args = {
      req: {
        ...baseReq,
        locale: 'all',
        query: { publishSpecificLocale: 'pl' },
      },
      doc: { id: '1', title: 'Hello' },
      previousDoc: { id: '1', title: 'Old' },
      global: { slug: 'work-page' },
    } as unknown as RevalidateArgs

    expect(resolveChangedLocales({ args, locales: ['pl', 'en', 'de'] })).toEqual(['pl'])
  })

  it('prefers query.locale over req.locale (publish-all leaves req on last locale)', () => {
    expect(
      getRequestLocale({
        locale: 'de',
        query: { locale: 'en', publishAllLocales: 'true' },
      }),
    ).toBe('en')
    expect(
      getRequestLocale({
        locale: 'en',
        query: { locale: 'de', publishAllLocales: 'true' },
      }),
    ).toBe('de')
  })

  it('scopes to the active locale on single-locale updates', () => {
    const args = {
      operation: 'update',
      req: { ...baseReq, locale: 'de' },
      doc: { id: '1' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs

    expect(resolveChangedLocales({ args, locales: ['en', 'de'] })).toEqual(['de'])
  })

  it('expands to all locales for publish-all', () => {
    const args = {
      operation: 'update',
      req: {
        ...baseReq,
        locale: 'en',
        query: { publishAllLocales: 'true' },
      },
      doc: { id: '1' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs

    expect(resolveChangedLocales({ args, locales: ['en', 'de'] })).toEqual(['en', 'de'])
  })
})

describe('skip rules', () => {
  it('skips draft saves but not deletes', () => {
    const draftArgs = {
      operation: 'update',
      req: { ...baseReq, query: { draft: 'true' } },
      doc: { id: '1' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs

    const deleteArgs = {
      req: { ...baseReq, query: { draft: 'true' } },
      doc: { id: '1' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs

    expect(shouldSkipDraftRevalidation(draftArgs)).toBe(true)
    expect(shouldSkipDraftRevalidation(deleteArgs)).toBe(false)
  })

  it('skips draft docs when query.draft is missing (admin autosave create)', () => {
    const args = {
      operation: 'create',
      req: baseReq,
      doc: { id: '1', _status: 'draft' },
      collection: { slug: 'projects', versions: { drafts: true } },
    } as unknown as RevalidateArgs

    expect(shouldSkipDraftRevalidation(args)).toBe(true)
    expect(isUnpublishedStatus('draft')).toBe(true)
    expect(isUnpublishedStatus({ pl: 'draft', en: undefined })).toBe(true)
    expect(isUnpublishedStatus({ pl: 'published', en: 'draft' })).toBe(false)
    expect(isUnpublishedStatus('published')).toBe(false)
  })

  it('skips unpublished collection docs when drafts are enabled', () => {
    const args = {
      operation: 'update',
      req: baseReq,
      doc: { id: '1' },
      collection: { slug: 'projects', versions: { drafts: true } },
    } as unknown as RevalidateArgs

    expect(
      shouldSkipUnpublishedLocaleDoc({
        args,
        locale: 'de',
        localeDoc: { _status: 'draft', title: 'x' },
        operation: 'update',
      }),
    ).toBe(true)

    expect(
      shouldSkipUnpublishedLocaleDoc({
        args,
        locale: 'de',
        localeDoc: { _status: 'published', title: 'x' },
        operation: 'update',
      }),
    ).toBe(false)
  })

  it('respects localizeStatus map on collection docs', () => {
    const args = {
      operation: 'update',
      req: baseReq,
      doc: { id: '1' },
      collection: {
        slug: 'projects',
        versions: { drafts: { localizeStatus: true } },
      },
    } as unknown as RevalidateArgs

    expect(
      shouldSkipUnpublishedLocaleDoc({
        args,
        locale: 'de',
        localeDoc: { _status: { pl: 'published', de: 'published' }, title: 'x' },
        operation: 'update',
      }),
    ).toBe(false)

    expect(
      shouldSkipUnpublishedLocaleDoc({
        args,
        locale: 'de',
        localeDoc: { _status: { pl: 'published', de: 'draft' }, title: 'x' },
        operation: 'update',
      }),
    ).toBe(true)
  })
})

describe('revalidate', () => {
  beforeEach(() => {
    mock.restore()
  })

  const createTestRevalidate = async (targets: Array<{ url: string; secret: string }>) => {
    const { http } = await import('../../../dispatchers/http/index.js')
    const dispatcher = http({ target: targets })
    return (args: RevalidateArgs) => runCommitted(args, dispatcher)
  }

  it('POSTs changes and logs on non-OK responses', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://frontend.test/api/revalidate', secret: 'secret' },
    ])

    const fetchMock = mock(() => Promise.resolve({ ok: false, status: 500, statusText: 'Error' }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const loggerError = mock(() => {})
    const saveAt = '2026-01-01T12:00:00.000Z'

    await revalidate({
      operation: 'update',
      req: {
        ...baseReq,
        payload: {
          ...baseReq.payload,
          logger: { error: loggerError, info: mock(() => {}) },
          findByID: mock(() =>
            Promise.resolve({
              id: '1',
              title: 'Hello',
              _status: 'published',
            }),
          ),
          findVersions: mock(() =>
            Promise.resolve({
              docs: [
                {
                  updatedAt: saveAt,
                  version: { title: 'Hello', _status: 'published' },
                },
                {
                  updatedAt: '2026-01-01T11:00:00.000Z',
                  version: { title: 'Old', _status: 'published' },
                },
              ],
            }),
          ),
        },
      },
      doc: {
        id: '1',
        title: 'Hello',
        _status: 'published',
        updatedAt: saveAt,
      },
      previousDoc: { id: '1', title: 'Old' },
      collection: {
        slug: 'projects',
        versions: { drafts: true },
      },
    } as unknown as RevalidateArgs)

    // 500 is retryable: three attempts (retries = 2).
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://frontend.test/api/revalidate',
    )
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    )
    expect(body.source).toBe('payload')
    expect(Array.isArray(body.data)).toBe(true)
    expect(loggerError).toHaveBeenCalled()
  })

  it('reads version history through the mutation request transaction', async () => {
    const findVersions = mock((_options: { req?: unknown }) =>
      Promise.resolve({
        docs: [
          {
            updatedAt: '2026-01-01T12:00:00.000Z',
            version: { title: 'Current', _status: 'published' },
          },
          {
            updatedAt: '2026-01-01T11:00:00.000Z',
            version: { title: 'Previous', _status: 'published' },
          },
        ],
      }),
    )
    const req = {
      ...baseReq,
      transactionID: 'transaction-1',
      context: {},
      payload: {
        ...baseReq.payload,
        findByID: mock(() => Promise.resolve({ id: '1', title: 'Current', _status: 'published' })),
        findVersions,
      },
    }

    await runHookUnflushed(
      {
        operation: 'update',
        req,
        doc: { id: '1', title: 'Current', _status: 'published' },
        previousDoc: { id: '1', title: 'Previous', _status: 'published' },
        collection: { slug: 'projects', versions: { drafts: true } },
      } as unknown as RevalidateArgs,
      { dispatch: async () => ({ status: 'accepted' }) },
    )

    expect(findVersions).toHaveBeenCalled()
    expect(findVersions.mock.calls.every(([options]) => options.req === req)).toBe(true)
  })

  it('POSTs to every configured target with matching Bearer tokens', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://web.test/api/revalidate', secret: 'web-secret' },
      { url: 'http://preview.test/api/revalidate', secret: 'preview-secret' },
    ])

    const fetchMock = mock((url: string) =>
      Promise.resolve({
        ok: !url.includes('preview'),
        status: url.includes('preview') ? 500 : 200,
        statusText: url.includes('preview') ? 'Error' : 'OK',
      }),
    )
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const loggerError = mock(() => {})

    await revalidate({
      operation: 'delete',
      req: {
        ...baseReq,
        payload: {
          ...baseReq.payload,
          logger: { error: loggerError },
        },
      },
      doc: { id: '1', title: 'Gone' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs)

    // Main target: one attempt. Preview 500s is retried twice: 1 + 3.
    expect(fetchMock).toHaveBeenCalledTimes(4)

    const calls = fetchMock.mock.calls as unknown as Array<
      [string, { headers: Record<string, string> }]
    >
    const byUrl = Object.fromEntries(calls.map(([url, init]) => [url, init.headers.Authorization]))
    expect(byUrl['http://web.test/api/revalidate']).toBe('Bearer web-secret')
    expect(byUrl['http://preview.test/api/revalidate']).toBe('Bearer preview-secret')
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  it('logs when fetch throws', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://frontend.test/api/revalidate', secret: 'secret' },
    ])

    // @ts-expect-error test double
    globalThis.fetch = mock(() => Promise.reject(new Error('network down')))

    const loggerError = mock(() => {})

    await revalidate({
      operation: 'delete',
      req: {
        ...baseReq,
        payload: {
          ...baseReq.payload,
          logger: { error: loggerError },
        },
      },
      doc: { id: '1', title: 'Gone' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs)

    expect(loggerError).toHaveBeenCalled()
  })

  it('publish-all: posts every locale with previousDoc', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://frontend.test/api/revalidate', secret: 'secret' },
    ])

    const fetchMock = mock(() => Promise.resolve({ ok: true }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const findGlobal = mock(({ locale }: { locale: string }) =>
      Promise.resolve({
        id: '1',
        title: `Title ${locale}`,
        _status: 'published',
      }),
    )
    const findGlobalVersions = mock(({ locale }: { locale: string }) =>
      Promise.resolve({
        docs: [
          {
            // this publish-all cluster (pl→en→de within seconds)
            updatedAt: '2026-01-01T12:00:02.000Z',
            version: { title: `Title ${locale}`, _status: 'published' },
          },
          {
            updatedAt: '2026-01-01T12:00:01.000Z',
            version: { title: `Mid ${locale}`, _status: 'published' },
          },
          {
            updatedAt: '2026-01-01T12:00:00.000Z',
            version: { title: `Early ${locale}`, _status: 'published' },
          },
          {
            // true previous publish — outside batch window
            updatedAt: '2026-01-01T10:00:00.000Z',
            version: { title: `Old ${locale}`, _status: 'published' },
          },
        ],
      }),
    )

    await revalidate({
      req: {
        ...baseReq,
        query: { locale: 'pl', publishAllLocales: 'true' },
        payload: {
          ...baseReq.payload,
          config: {
            localization: {
              locales: [
                { code: 'pl', label: 'PL' },
                { code: 'en', label: 'EN' },
                { code: 'de', label: 'DE' },
              ],
            },
          },
          logger: { info: mock(() => {}), error: mock(() => {}) },
          findGlobal,
          findGlobalVersions,
        },
      },
      doc: { id: '1', title: 'Title pl', _status: 'published' },
      global: { slug: 'work-page' },
    } as unknown as RevalidateArgs)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const envelope = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    ) as {
      source: string
      data: Array<{ locale: string; previousSlug?: string; global?: string }>
    }
    expect(envelope.source).toBe('payload')
    expect(envelope.data.map((c) => c.locale)).toEqual(['pl', 'en', 'de'])
    expect(envelope.data.every((c) => c.global === 'work-page')).toBe(true)
  })

  it('publish-all: dispatches published locales even when content unchanged', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://frontend.test/api/revalidate', secret: 'secret' },
    ])

    const fetchMock = mock(() => Promise.resolve({ ok: true }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const stableTitle = 'Same title'
    const findGlobal = mock(() =>
      Promise.resolve({
        id: '1',
        title: stableTitle,
        _status: 'published',
      }),
    )
    const findGlobalVersions = mock(() =>
      Promise.resolve({
        docs: [
          {
            updatedAt: '2026-01-01T12:00:02.000Z',
            version: { title: stableTitle, _status: 'published' },
          },
          {
            updatedAt: '2026-01-01T10:00:00.000Z',
            version: { title: stableTitle, _status: 'published' },
          },
        ],
      }),
    )

    await revalidate({
      req: {
        ...baseReq,
        query: { locale: 'pl', publishAllLocales: 'true' },
        payload: {
          ...baseReq.payload,
          config: {
            localization: {
              locales: [
                { code: 'pl', label: 'PL' },
                { code: 'en', label: 'EN' },
                { code: 'de', label: 'DE' },
              ],
            },
          },
          logger: { info: mock(() => {}), error: mock(() => {}) },
          findGlobal,
          findGlobalVersions,
        },
      },
      doc: { id: '1', title: stableTitle, _status: 'published' },
      global: { slug: 'work-page' },
    } as unknown as RevalidateArgs)

    const envelope = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    ) as { data: Array<{ locale: string }> }
    expect(envelope.data.map((c) => c.locale)).toEqual(['pl', 'en', 'de'])
  })

  it('no-ops on draft saves', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://frontend.test/api/revalidate', secret: 'secret' },
    ])

    const fetchMock = mock(() => Promise.resolve({ ok: true }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    await revalidate({
      operation: 'update',
      req: { ...baseReq, query: { draft: 'true' } },
      doc: { id: '1' },
      collection: { slug: 'projects' },
    } as unknown as RevalidateArgs)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no-ops on draft create without query.draft (admin autosave)', async () => {
    const revalidate = await createTestRevalidate([
      { url: 'http://frontend.test/api/revalidate', secret: 'secret' },
    ])

    const fetchMock = mock(() => Promise.resolve({ ok: true }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    await revalidate({
      operation: 'create',
      req: baseReq,
      doc: { id: '1', title: 'Draft', _status: 'draft' },
      collection: { slug: 'projects', versions: { drafts: true } },
    } as unknown as RevalidateArgs)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dispatches global single-locale publish when title changes within batch window', async () => {
    const { http } = await import('../../../dispatchers/http/index.js')
    const fetchMock = mock(() => Promise.resolve({ ok: true, status: 200 }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const saveAt = '2026-01-01T12:00:30.000Z'
    const dispatcher = http({ target: { url: 'http://frontend.test/api/revalidate', secret: 's' } })

    await runCommitted(
      {
        operation: 'update',
        req: {
          ...baseReq,
          locale: 'pl',
          query: { publishSpecificLocale: 'pl' },
          payload: {
            ...baseReq.payload,
            logger: { error: mock(() => {}), info: mock(() => {}) },
            findGlobal: mock(() =>
              Promise.resolve({
                title: 'MANUAL-REV-PROD-PL-v3',
                _status: 'published',
              }),
            ),
            findGlobalVersions: mock(() =>
              Promise.resolve({
                docs: [
                  {
                    updatedAt: saveAt,
                    version: { title: 'MANUAL-REV-PROD-PL-v3', _status: 'published' },
                  },
                  {
                    updatedAt: '2026-01-01T12:00:05.000Z',
                    version: { title: 'MANUAL-REV-HOME-PL-v2', _status: 'published' },
                  },
                ],
              }),
            ),
          },
        },
        doc: { title: 'MANUAL-REV-PROD-PL-v3', _status: 'published' },
        previousDoc: { title: 'MANUAL-REV-HOME-PL-v2', _status: 'published' },
        global: { slug: 'home-page' },
      } as unknown as RevalidateArgs,
      dispatcher,
    )

    expect(fetchMock).toHaveBeenCalled()
  })

  it('skips dispatch when only plugin excludeFields change', async () => {
    const { http } = await import('../../../dispatchers/http/index.js')
    const fetchMock = mock(() => Promise.resolve({ ok: true, status: 200 }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const saveAt = '2026-01-01T12:00:00.000Z'
    const dispatcher = http({ target: { url: 'http://frontend.test/api/revalidate', secret: 's' } })

    await runCommitted(
      {
        operation: 'update',
        req: {
          ...baseReq,
          payload: {
            ...baseReq.payload,
            logger: { error: mock(() => {}), info: mock(() => {}) },
            findByID: mock(() =>
              Promise.resolve({
                id: '1',
                title: 'Hello',
                name: 'New admin label',
                _status: 'published',
              }),
            ),
            findVersions: mock(() =>
              Promise.resolve({
                docs: [
                  {
                    updatedAt: saveAt,
                    version: {
                      title: 'Hello',
                      name: 'Old admin label',
                      _status: 'published',
                    },
                  },
                  {
                    updatedAt: '2026-01-01T11:00:00.000Z',
                    version: {
                      title: 'Hello',
                      name: 'Old admin label',
                      _status: 'published',
                    },
                  },
                ],
              }),
            ),
          },
        },
        doc: { id: '1', title: 'Hello', name: 'New admin label', _status: 'published' },
        collection: { slug: 'projects', versions: { drafts: true } },
      } as unknown as RevalidateArgs,
      dispatcher,
      { pluginExcludeFields: ['name'] },
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dispatches when schema excludeFields replaces plugin list', async () => {
    const { http } = await import('../../../dispatchers/http/index.js')
    const fetchMock = mock(() => Promise.resolve({ ok: true, status: 200 }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const saveAt = '2026-01-01T12:00:00.000Z'
    const dispatcher = http({ target: { url: 'http://frontend.test/api/revalidate', secret: 's' } })

    await runCommitted(
      {
        operation: 'update',
        req: {
          ...baseReq,
          payload: {
            ...baseReq.payload,
            logger: { error: mock(() => {}), info: mock(() => {}) },
            findByID: mock(() =>
              Promise.resolve({
                id: '1',
                title: 'Hello',
                name: 'New admin label',
                _status: 'published',
              }),
            ),
            findVersions: mock(() =>
              Promise.resolve({
                docs: [
                  {
                    updatedAt: saveAt,
                    version: {
                      title: 'Hello',
                      name: 'Old admin label',
                      _status: 'published',
                    },
                  },
                  {
                    updatedAt: '2026-01-01T11:00:00.000Z',
                    version: {
                      title: 'Hello',
                      name: 'Old admin label',
                      _status: 'published',
                    },
                  },
                ],
              }),
            ),
          },
        },
        doc: { id: '1', title: 'Hello', name: 'New admin label', _status: 'published' },
        collection: {
          slug: 'projects',
          versions: { drafts: true },
          custom: { revalidation: { excludeFields: ['description'] } },
        },
      } as unknown as RevalidateArgs,
      dispatcher,
      { pluginExcludeFields: ['name'] },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dispatches all published locales when identifier changes on one tab (language switcher slugs)', async () => {
    const { http } = await import('../../../dispatchers/http/index.js')
    const fetchMock = mock(() => Promise.resolve({ ok: true, status: 200 }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock

    const saveAt = '2026-01-01T12:00:00.000Z'
    const dispatcher = http({ target: { url: 'http://frontend.test/api/revalidate', secret: 's' } })

    const localeDocs: Record<string, Record<string, unknown>> = {
      pl: { id: '1', title: 'Projekt', slug: 'pl-nowy', _status: 'published' },
      en: { id: '1', title: 'Project', slug: 'en-slug', _status: 'published' },
      de: { id: '1', title: 'Projekt DE', slug: 'de-slug', _status: 'published' },
    }

    const previousByLocale: Record<string, Record<string, unknown>> = {
      pl: { id: '1', title: 'Projekt', slug: 'pl-stary', _status: 'published' },
      en: { id: '1', title: 'Project', slug: 'en-slug', _status: 'published' },
      de: { id: '1', title: 'Projekt DE', slug: 'de-slug', _status: 'published' },
    }

    await runCommitted(
      {
        operation: 'update',
        req: {
          query: { publishSpecificLocale: 'pl' },
          locale: 'pl',
          payload: {
            config: {
              localization: {
                locales: [
                  { code: 'pl', label: 'Polish' },
                  { code: 'en', label: 'English' },
                  { code: 'de', label: 'German' },
                ],
              },
            },
            logger: { error: mock(() => {}), info: mock(() => {}) },
            findByID: mock(({ locale }: { locale?: string }) => {
              const code = typeof locale === 'string' ? locale : 'pl'
              return Promise.resolve(localeDocs[code] ?? localeDocs.pl)
            }),
            findVersions: mock(({ locale }: { locale?: string }) => {
              const code = typeof locale === 'string' ? locale : 'pl'
              const previous = previousByLocale[code] ?? previousByLocale.pl
              return Promise.resolve({
                docs: [
                  { updatedAt: saveAt, version: localeDocs[code] ?? localeDocs.pl },
                  { updatedAt: '2026-01-01T11:00:00.000Z', version: previous },
                ],
              })
            }),
          },
        },
        doc: {
          id: '1',
          title: 'Projekt',
          slug: 'pl-nowy',
          _status: { pl: 'published', en: 'published', de: 'published' },
        },
        previousDoc: { id: '1', title: 'Projekt', slug: 'pl-stary' },
        collection: {
          slug: 'projects',
          versions: { drafts: { localizeStatus: true } },
          fields: [{ name: 'slug', type: 'text', localized: true }],
          custom: { revalidation: { identifier: 'slug' } },
        },
      } as unknown as RevalidateArgs,
      dispatcher,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    )
    const postedLocales = body.data.map((row: { locale: string }) => row.locale)
    expect(postedLocales).toContain('pl')
    expect(postedLocales).toContain('en')
    expect(postedLocales).toContain('de')
    const enRows = body.data.filter((row: { locale: string }) => row.locale === 'en')
    expect(enRows).toHaveLength(1)
    expect(enRows[0]?.slug).toBe('en-slug')
  })

  it('finds the previous published identifier beyond the first versions page', async () => {
    const { http } = await import('../../../dispatchers/http/index.js')
    const fetchMock = mock(() => Promise.resolve({ ok: true, status: 200 }))
    // @ts-expect-error test double
    globalThis.fetch = fetchMock
    const dispatcher = http({ target: { url: 'http://frontend.test/api/revalidate', secret: 's' } })
    const localeDocs: Record<string, Record<string, unknown>> = {
      pl: { id: '1', title: 'Projekt', slug: 'pl-new', _status: 'published' },
      en: { id: '1', title: 'Project', slug: 'en-slug', _status: 'published' },
      de: { id: '1', title: 'Projekt DE', slug: 'de-slug', _status: 'published' },
    }
    const findVersions = mock(({ locale, page = 1 }: { locale?: string; page?: number }) => {
      const current = localeDocs[locale ?? 'pl']!
      if (page === 1) {
        return Promise.resolve({
          docs: Array.from({ length: 30 }, (_, index) => ({
            updatedAt: `2026-01-01T12:${String(index).padStart(2, '0')}:00.000Z`,
            version: { slug: `draft-${index}`, _status: 'draft' },
          })),
          hasNextPage: true,
        })
      }
      return Promise.resolve({
        docs: [
          { updatedAt: '2026-01-01T12:00:00.000Z', version: current },
          {
            updatedAt: '2026-01-01T11:00:00.000Z',
            version: { ...current, slug: locale === 'pl' ? 'pl-old' : current.slug },
          },
        ],
        hasNextPage: false,
      })
    })

    await runCommitted(
      {
        operation: 'update',
        req: {
          ...baseReq,
          locale: 'pl',
          query: { publishSpecificLocale: 'pl' },
          payload: {
            ...baseReq.payload,
            config: {
              localization: {
                locales: [
                  { code: 'pl', label: 'Polish' },
                  { code: 'en', label: 'English' },
                  { code: 'de', label: 'German' },
                ],
              },
            },
            findByID: mock(({ locale }: { locale?: string }) =>
              Promise.resolve(localeDocs[locale ?? 'pl']),
            ),
            findVersions,
          },
        },
        doc: localeDocs.pl,
        previousDoc: { id: '1', title: 'Projekt', slug: 'pl-old', _status: 'published' },
        collection: {
          slug: 'projects',
          versions: { drafts: true },
          fields: [{ name: 'slug', type: 'text', localized: true }],
          custom: { revalidation: { identifier: 'slug' } },
        },
      } as unknown as RevalidateArgs,
      dispatcher,
    )

    expect(findVersions.mock.calls.some(([options]) => options.page === 2)).toBe(true)
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    )
    expect(body.data.map((item: { locale: string }) => item.locale)).toEqual(
      expect.arrayContaining(['pl', 'en', 'de']),
    )
    expect(body.data.some((item: { slug: string }) => item.slug === 'pl-old')).toBe(true)
  })
})
