import { afterEach, describe, expect, it } from 'bun:test'
import { payloadRevalidationItemSchema } from '../../sources/payload'
import {
  type DefineRevalidationTagsInput,
  defineRevalidation,
  defineRevalidationTags,
  getDefinedRevalidation,
  resetDefinedRevalidation,
} from './define-revalidation.ts'
import type { DefineRevalidationInput } from './host-types.ts'

const baseHost = {
  secret: 'shared-secret',
  tags: { homePage: '[locale]:home-page' },
  sources: {
    payload: {
      schema: payloadRevalidationItemSchema,
      resolve: () => 'home-page',
    },
  },
  layers: (t) => ({
    next: [{ key: { payload: 'home-page' }, invalidates: [t.homePage] }],
  }),
} satisfies DefineRevalidationInput<{ homePage: string }, Record<string, never>, 'payload'>

afterEach(() => {
  resetDefinedRevalidation()
})

describe('defineRevalidation', () => {
  it('registers and returns tags', () => {
    const { tags } = defineRevalidation(baseHost)
    expect(tags.homePage({ locale: 'en' })).toBe('en:home-page')
    expect(getDefinedRevalidation().secret).toBe('shared-secret')
    expect(getDefinedRevalidation().host).toBeDefined()
  })

  it('allows repeat defineRevalidation with same secret in dev', () => {
    defineRevalidation(baseHost)
    defineRevalidation(baseHost)
    expect(getDefinedRevalidation().secret).toBe('shared-secret')
  })

  it('rejects different secret on second call', () => {
    defineRevalidation(baseHost)
    expect(() => defineRevalidation({ ...baseHost, secret: 'other-secret' })).toThrow(
      /different secret/,
    )
  })
})

describe('defineRevalidationTags', () => {
  it('builds tags without a secret and without registering a handler config', () => {
    const { tags } = defineRevalidationTags({
      tags: { homePage: '[locale]:home-page' },
      sources: baseHost.sources,
      layers: baseHost.layers,
    } as unknown as DefineRevalidationTagsInput<
      { homePage: string },
      Record<string, never>,
      'payload'
    >)
    expect(tags.homePage({ locale: 'en' })).toBe('en:home-page')
    expect(() => getDefinedRevalidation()).toThrow('defineRevalidation must be called')
  })

  it('does not weaken defineRevalidation: a missing secret still throws', () => {
    expect(() =>
      defineRevalidation({ ...baseHost, secret: '' } as unknown as DefineRevalidationInput),
    ).toThrow('defineRevalidation: secret is required')
  })

  it('leaves no registered secret behind, so a later defineRevalidation registers the real one', () => {
    defineRevalidationTags({
      tags: { homePage: '[locale]:home-page' },
      sources: baseHost.sources,
      layers: baseHost.layers,
    } as unknown as DefineRevalidationTagsInput<
      { homePage: string },
      Record<string, never>,
      'payload'
    >)
    defineRevalidation(baseHost)
    expect(getDefinedRevalidation().secret).toBe('shared-secret')
  })
})
