import { describe, expect, it } from 'bun:test'
import { defineRevalidation, invalidKey } from '../../../../src/consumers/next/index'
import { resolveTagEntries } from '../../../../src/consumers/next/resolve-tag-params'

const pageTag = (template: string) => {
  const executed: string[][] = []
  const { POST, tags } = defineRevalidation({
    secret: 'secret',
    tags: { page: template },
    resolve: (event) => event.key ?? invalidKey(),
    rules: ({ tags }) => ({ pages: [tags.page] }),
    execute: {
      next: async ({ tags }) => {
        executed.push(tags.map((tag) => tag.value))
      },
    },
  })
  return { POST, tags, executed }
}

const post = (handler: (request: Request) => Promise<Response>, body: unknown) =>
  handler(
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
    const { tags } = pageTag('[locale]:page:[slug]')
    const page = tags.page as unknown as (params: Record<string, unknown>) => string
    expect(() => page({ locale: 'en', slug: null })).toThrow('Tag "page" missing param(s): slug')
  })

  it('skips a tag whose parameter is null and reports it', () => {
    const { tags } = pageTag('[locale]:page:[slug]')
    const skipped: string[] = []
    const entries = resolveTagEntries(
      tags.page as never,
      { locale: 'en', slug: null as never },
      'expire',
      undefined,
      () => skipped.push('page'),
    )
    expect(entries).toEqual([])
    expect(skipped).toEqual(['page'])
  })
})

describe('configuration-bound handlers', () => {
  it('keeps each handler bound to its own rules', async () => {
    const first = pageTag('[locale]:v1:[slug]')
    const second = pageTag('[locale]:v2:[slug]')

    expect((await post(first.POST, event)).status).toBe(200)
    expect(first.executed.at(-1)).toEqual(['en:v1:about'])
    expect((await post(second.POST, event)).status).toBe(200)
    expect(second.executed.at(-1)).toEqual(['en:v2:about'])
  })
})

describe('layers without an execute handler', () => {
  it('fails the request instead of running Next revalidation for an unknown layer', async () => {
    const executed: string[] = []
    const { POST } = defineRevalidation({
      secret: 'secret',
      tags: { page: '[locale]:page:[slug]' },
      resolve: (event) => event.key ?? invalidKey(),
      rules: {
        layers: {
          next: ({ tags }) => ({ pages: [tags.page] }),
          cdn: ({ tags }) => ({ pages: [tags.page] }),
        },
      },
      execute: {
        next: async () => {
          executed.push('next')
        },
      },
    })
    const response = await post(POST, event)
    expect(response.status).toBe(500)
    expect(await response.text()).toContain('cdn')
    expect(executed).toEqual(['next'])
  })
})
