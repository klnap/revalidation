import { describe, expect, it } from 'bun:test'
import { defineRevalidation, invalidKey } from './index.js'

const makeConfig = (secret: string) =>
  defineRevalidation({
    secret,
    tags: { home: '[locale]:home', navigation: 'navigation' },
    paths: { home: '/[locale]' },
    resolve: (event) => event.key ?? invalidKey(),
    rules: ({ tags, paths }) => ({
      home: { tags: [tags.home], paths: [paths.home] },
      navigation: [tags.navigation],
    }),
  })

const request = (secret: string) =>
  new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'webhook',
      data: { key: 'unmatched' },
    }),
  })

describe('defineRevalidation', () => {
  it('returns parameterized tags, paths, and a bound POST handler', async () => {
    const { tags, paths, POST } = makeConfig('first-secret')

    expect(tags.home({ locale: 'en' })).toBe('en:home')
    expect(tags.navigation()).toBe('navigation')
    expect(paths.home({ locale: 'en' })).toBe('/en')
    expect((await POST(request('first-secret'))).status).toBe(200)
  })

  it('creates independent handlers without shared configuration state', async () => {
    const first = makeConfig('first-secret')
    const second = makeConfig('second-secret')

    expect((await first.POST(request('first-secret'))).status).toBe(200)
    expect((await first.POST(request('second-secret'))).status).toBe(401)
    expect((await second.POST(request('second-secret'))).status).toBe(200)
    expect((await second.POST(request('first-secret'))).status).toBe(401)
  })

  it('supports paths without tags', () => {
    const { paths } = defineRevalidation({
      secret: 'secret',
      paths: { home: '/[locale]' },
      resolve: () => 'home',
      rules: ({ paths }) => ({ home: { paths: [paths.home] } }),
    })

    expect(paths.home({ locale: 'en' })).toBe('/en')
  })

  it('supports tags without paths', () => {
    const { tags, paths } = defineRevalidation({
      secret: 'secret',
      tags: { navigation: 'navigation' },
      resolve: () => 'navigation',
      rules: ({ tags }) => ({ navigation: [tags.navigation] }),
    })

    expect(tags.navigation()).toBe('navigation')
    expect(paths).toEqual({})
  })
})
