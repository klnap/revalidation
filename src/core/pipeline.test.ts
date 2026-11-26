import { describe, expect, it } from 'bun:test'
import * as v from 'valibot'

import { createPipeline } from './pipeline.js'

const itemSchema = v.object({
  locale: v.string(),
  collection: v.optional(v.string()),
  global: v.optional(v.string()),
  slug: v.optional(v.string()),
})

describe('createPipeline', () => {
  const config = {
    mode: 'expire' as const,
    sources: {
      payload: {
        schema: itemSchema,
        resolve: (data: unknown) => {
          const item = data as { collection?: string; global?: string }
          return item.collection ?? item.global ?? ''
        },
      },
    },
    cache: {
      tags: {
        project: (data: unknown) => {
          const item = data as { locale: string; slug?: string }
          return item.slug ? `${item.locale}:project:${item.slug}` : []
        },
        list: (data: unknown) => {
          const item = data as { locale: string }
          return `${item.locale}:work-page`
        },
      },
      paths: {},
    },
    layers: {
      next: {
        projects: { tags: ['project', 'list'] },
      },
    },
  }

  it('inspects single item', () => {
    const pipeline = createPipeline(config)
    const result = pipeline.inspect({
      source: 'payload',
      data: { locale: 'pl', collection: 'projects', slug: 'foo' },
    })

    expect(result.cacheKeys).toEqual(['projects'])
    expect(result.layers.next?.tags.map((t) => t.value)).toEqual(['pl:project:foo', 'pl:work-page'])
  })

  it('normalizes data arrays', () => {
    const pipeline = createPipeline(config)
    const result = pipeline.inspect({
      source: 'payload',
      data: [
        { locale: 'pl', collection: 'projects', slug: 'a' },
        { locale: 'en', collection: 'projects', slug: 'b' },
      ],
    })

    expect(result.items).toHaveLength(2)
    expect(result.layers.next?.tags).toHaveLength(4)
  })

  it('does not resolve inherited object names as sources', () => {
    const pipeline = createPipeline(config)
    expect(() => pipeline.inspect({ source: 'constructor', data: [] })).toThrow(
      'Unknown source: constructor',
    )
    expect(() => pipeline.inspect({ source: 'toString', data: [] })).toThrow(
      'Unknown source: toString',
    )
  })
})
