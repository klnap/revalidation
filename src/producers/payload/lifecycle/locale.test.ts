import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'

import {
  isPublishAllLocales,
  listLocales,
  resolveChangedLocales,
  resolveDefaultLocaleCode,
} from './locale.ts'
import type { RevalidateArgs } from './types.ts'

const reqWithoutLocalization = {
  locale: 'en',
  query: {},
  payload: { config: {} },
} as unknown as PayloadRequest

describe('listLocales / resolveDefaultLocaleCode', () => {
  it('uses a single default locale when localization is off', () => {
    expect(listLocales(reqWithoutLocalization)).toEqual(['en'])
    expect(resolveDefaultLocaleCode(reqWithoutLocalization)).toBe('en')
  })

  it('prefers config.defaultLocale for monolingual hosts', () => {
    const req = {
      ...reqWithoutLocalization,
      payload: {
        config: {
          localization: { defaultLocale: 'pl', locales: ['pl'] },
        },
      },
    } as unknown as PayloadRequest

    expect(resolveDefaultLocaleCode(req)).toBe('pl')
  })

  it('lists every configured locale when localization is on', () => {
    const req = {
      ...reqWithoutLocalization,
      payload: {
        config: {
          localization: {
            defaultLocale: 'en',
            locales: [{ code: 'en' }, { code: 'de' }],
          },
        },
      },
    } as unknown as PayloadRequest

    expect(listLocales(req)).toEqual(['en', 'de'])
  })
})

describe('resolveChangedLocales without localization', () => {
  const baseArgs = {
    operation: 'update',
    req: reqWithoutLocalization,
    doc: { title: 'Hello', _status: 'published' },
    global: { slug: 'landing' },
  } as unknown as RevalidateArgs

  it('scopes publish to the default locale code on monolingual hosts', () => {
    expect(
      resolveChangedLocales({
        args: baseArgs,
        locales: listLocales(reqWithoutLocalization),
      }),
    ).toEqual(['en'])
  })

  it('still expands publish-all to the single effective locale', () => {
    const args = {
      ...baseArgs,
      req: {
        ...reqWithoutLocalization,
        query: { publishAllLocales: 'true' },
      },
    } as unknown as RevalidateArgs

    expect(resolveChangedLocales({ args, locales: listLocales(args.req) })).toEqual(['en'])
  })
})

describe('isPublishAllLocales / resolveChangedLocales (multilingual)', () => {
  const multiReq = {
    locale: 'pl',
    query: { locale: 'pl' },
    payload: {
      config: {
        localization: {
          defaultLocale: 'pl',
          locales: [{ code: 'pl' }, { code: 'en' }, { code: 'de' }],
        },
      },
    },
  } as unknown as PayloadRequest

  const multiArgs = {
    operation: 'update',
    req: multiReq,
    doc: { title: 'x', _status: 'published' },
    global: { slug: 'home-page' },
  } as unknown as RevalidateArgs

  it('scopes single-tab publish to query locale', () => {
    expect(resolveChangedLocales({ args: multiArgs, locales: listLocales(multiReq) })).toEqual([
      'pl',
    ])
  })

  it('expands publish-all from query flag', () => {
    const args = {
      ...multiArgs,
      req: { ...multiReq, query: { locale: 'pl', publishAllLocales: 'true' } },
    } as unknown as RevalidateArgs
    expect(resolveChangedLocales({ args, locales: listLocales(args.req) })).toEqual([
      'pl',
      'en',
      'de',
    ])
  })

  it('expands publish-all from Local API context', () => {
    expect(
      isPublishAllLocales({ query: { locale: 'pl' }, context: { publishAllLocales: true } }),
    ).toBe(true)
    const args = {
      ...multiArgs,
      req: { ...multiReq, context: { publishAllLocales: true } },
    } as unknown as RevalidateArgs
    expect(resolveChangedLocales({ args, locales: listLocales(args.req) })).toEqual([
      'pl',
      'en',
      'de',
    ])
  })
})
