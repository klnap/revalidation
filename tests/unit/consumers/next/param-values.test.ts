import { describe, expect, it } from 'bun:test'
import { defaultParamsFromEvent } from '../../../../src/consumers/next/default-params-from-event'
import type { PathDef, TagDef, TagParamsBag } from '../../../../src/consumers/next/host-types'
import { resolvePathEntries } from '../../../../src/consumers/next/resolve-path-params'
import { resolveTagEntries } from '../../../../src/consumers/next/resolve-tag-params'
import { CacheSchemaError } from '../../../../src/core/errors'

const pathDef = ((params: TagParamsBag) => `/projects/${params.slug}`) as unknown as PathDef
const tagDef = ((params: TagParamsBag) => `project:${params.slug}`) as unknown as TagDef

const rejectsPath = (slug: string) =>
  expect(() => resolvePathEntries(pathDef, { slug }, 'expire')).toThrow(CacheSchemaError)

describe('path parameter values', () => {
  it('accepts an ordinary slug', () => {
    expect(resolvePathEntries(pathDef, { slug: 'tower-1' }, 'expire')).toEqual([
      { value: '/projects/tower-1', mode: 'expire' },
    ])
  })

  it('rejects "." and ".."', () => {
    rejectsPath('.')
    rejectsPath('..')
  })

  it('rejects a slash or a backslash', () => {
    rejectsPath('a/b')
    rejectsPath('a\\b')
  })

  it('rejects a control character', () => {
    rejectsPath('a\nb')
    rejectsPath('a\u0000b')
  })

  it('rejects a value longer than 256 characters and accepts one of exactly 256', () => {
    rejectsPath('x'.repeat(257))
    expect(resolvePathEntries(pathDef, { slug: 'x'.repeat(256) }, 'expire')).toHaveLength(1)
  })
})

describe('tag parameter values', () => {
  it('accepts a slash, which is not a path segment in a tag', () => {
    expect(resolveTagEntries(tagDef, { slug: 'a/b' }, 'expire')).toEqual([
      { value: 'project:a/b', mode: 'expire' },
    ])
  })

  it('rejects a value longer than 256 characters', () => {
    expect(() => resolveTagEntries(tagDef, { slug: 'x'.repeat(257) }, 'expire')).toThrow(
      CacheSchemaError,
    )
  })
})

describe('defaultParamsFromEvent', () => {
  it('rejects an event value longer than 256 characters', () => {
    expect(() =>
      defaultParamsFromEvent({ item: {}, slug: 'x'.repeat(257) } as never, ['slug']),
    ).toThrow(CacheSchemaError)
  })

  it('passes an ordinary value through', () => {
    expect(defaultParamsFromEvent({ item: {}, slug: 'tower' } as never, ['slug'])).toEqual({
      slug: 'tower',
    })
  })
})
