import { afterEach, describe, expect, it } from 'bun:test'
import {
  getDefinedRevalidation,
  resetDefinedRevalidation,
} from '../../../../src/consumers/next/define-revalidation'
import { defineRevalidation, invalidKey } from '../../../../src/consumers/next/index'
import { resolveTagEntries } from '../../../../src/consumers/next/resolve-tag-params'
import { POST } from '../../../../src/consumers/next/route/post'

afterEach(resetDefinedRevalidation)

const pageTag = (template: string) => {
  const executed: string[][] = []
  const config = {
    secret: 'secret',
    tags: { page: template },
    resolve: (event: { key?: string }) => event.key ?? invalidKey(),
    invalidate: (t: { page: (p: Record<string, string>) => string }) => ({ pages: [t.page] }),
    execute: {
      next: async ({ tags }: { tags: { value: string }[] }) => {
        executed.push(tags.map((t) => t.value))
      },
    },
  } as never
  return { config, executed }
}

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const event = {
  source: 'payload',
  data: [{ operation: 'update', locale: 'en', key: 'pages', collection: 'pages', slug: 'about' }],
}

describe('null template parameters', () => {
  it('throws for a null parameter instead of rendering "null"', () => {
    const { tags } = defineRevalidation({
      secret: 'secret',
      tags: { page: '[locale]:page:[slug]' },
      resolve: () => 'pages',
      invalidate: (t: { page: (p: Record<string, string>) => string }) => ({ pages: [t.page] }),
    } as never)
    const page = tags.page as unknown as (p: Record<string, unknown>) => string
    expect(() => page({ locale: 'en', slug: null })).toThrow('Tag "page" missing param(s): slug')
  })

  it('skips a tag whose parameter is null and reports it', () => {
    const { tags } = defineRevalidation({
      secret: 'secret',
      tags: { page: '[locale]:page:[slug]' },
      resolve: () => 'pages',
      invalidate: (t: { page: (p: Record<string, string>) => string }) => ({ pages: [t.page] }),
    } as never)
    const skipped: string[] = []
    const entries = resolveTagEntries(
      tags.page as unknown as never,
      { locale: 'en', slug: null as never },
      'expire',
      undefined,
      () => skipped.push('page'),
    )
    expect(entries).toEqual([])
    expect(skipped).toEqual(['page'])
  })
})

describe('dev reload', () => {
  it('serves the newest defineRevalidation configuration', async () => {
    const first = pageTag('[locale]:v1:[slug]')
    defineRevalidation(first.config)
    expect((await post(event)).status).toBe(200)
    expect(first.executed.at(-1)).toEqual(['en:v1:about'])

    const second = pageTag('[locale]:v2:[slug]')
    defineRevalidation(second.config)
    expect(getDefinedRevalidation()).toBeDefined()
    expect((await post(event)).status).toBe(200)
    expect(second.executed.at(-1)).toEqual(['en:v2:about'])
  })
})

describe('layers without an execute handler', () => {
  it('fails the request instead of running Next revalidation for an unknown layer', async () => {
    const executed: string[] = []
    defineRevalidation({
      secret: 'secret',
      tags: { page: '[locale]:page:[slug]' },
      resolve: (e: { key?: string }) => e.key ?? invalidKey(),
      invalidate: {
        layers: {
          next: (t: { page: unknown }) => ({ pages: [t.page] }),
          cdn: (t: { page: unknown }) => ({ pages: [t.page] }),
        },
      },
      execute: {
        next: async () => {
          executed.push('next')
        },
      },
    } as never)
    const response = await post(event)
    expect(response.status).toBe(500)
    expect(await response.text()).toContain('cdn')
    expect(executed).toEqual(['next'])
  })
})
