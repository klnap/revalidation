import { describe, expect, it } from 'bun:test'
import * as v from 'valibot'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { inspectHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'
import {
  type PayloadRevalidationItem,
  payloadRevalidationItemSchema,
} from '../../../../src/sources/payload'

describe('compileHostRevalidation', () => {
  const host = () =>
    compileHostRevalidation({
      secret: 's',
      tags: {
        project: '[locale]:project:[slug]',
        workPage: '[locale]:work-page',
        homePage: '[locale]:home-page',
      },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: ({ item }) => {
            const d = item as PayloadRevalidationItem
            return d.key
          },
        },
      },
      layers: ({ tags: t }) => ({
        next: [
          {
            key: { payload: 'projects' },
            invalidates: [t.project, t.workPage, t.homePage],
          },
        ],
      }),
    })

  it('AC#1: projects item resolves three tags', () => {
    const { runtime } = host()
    const result = inspectHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: {
          operation: 'update',
          locale: 'en',
          key: 'projects',
          collection: 'projects',
          slug: 'tower',
        },
      },
      'expire',
      100,
    )

    expect(result.cacheKeys).toEqual(['projects'])
    const values = result.layers.next?.tags.map((t) => t.value).sort()
    expect(values).toEqual(['en:home-page', 'en:project:tower', 'en:work-page'])
  })

  it('throws when resolve cannot read key', () => {
    const { runtime } = compileHostRevalidation({
      secret: 's',
      tags: { homePage: '[locale]:home-page' },
      sources: {
        payload: {
          schema: v.looseObject({ locale: v.string() }),
          resolve: (event) =>
            event.key ??
            (() => {
              throw new Error('missing key')
            })(),
        },
      },
      layers: ({ tags: t }) => ({
        next: [{ key: { payload: 'home-page' }, invalidates: [t.homePage] }],
      }),
    })
    expect(() =>
      inspectHostEnvelope(runtime, { source: 'payload', data: { locale: 'en' } }, 'expire', 100),
    ).toThrow(/missing key/)
  })

  it('skips wire items when no rule matches cache key', () => {
    const { runtime } = host()
    const result = inspectHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: {
          operation: 'update',
          locale: 'en',
          key: 'unknown-page',
          global: 'unknown-page',
        },
      },
      'expire',
      100,
    )
    expect(result.cacheKeys).toEqual([])
    expect(result.layers.next?.tags).toEqual([])
  })

  it('rejects invalidates with foreign tag function', () => {
    const foreign = (locale: string) => `${locale}:home-page`
    expect(() =>
      compileHostRevalidation({
        secret: 's',
        tags: { homePage: '[locale]:home-page' },
        sources: {
          payload: {
            schema: payloadRevalidationItemSchema,
            resolve: () => 'home-page',
          },
        },
        layers: ({ tags: t }) => ({
          next: [
            {
              key: { payload: 'home-page' },
              invalidates: [foreign as unknown as (typeof t)['homePage']],
            },
          ],
        }),
      }),
    ).toThrow(/not from this defineRevalidation/)
  })

  it('rejects a tag reference from another config when the IDs match', () => {
    const source = {
      payload: {
        schema: payloadRevalidationItemSchema,
        resolve: () => 'home-page',
      },
    }
    const foreign = compileHostRevalidation({
      secret: 'foreign',
      tags: { homePage: 'foreign:[locale]:home-page' },
      sources: source,
      layers: ({ tags }) => ({
        next: [{ key: { payload: 'home-page' }, invalidates: [tags.homePage] }],
      }),
    }).tags.homePage!

    expect(() =>
      compileHostRevalidation({
        secret: 'local',
        tags: { homePage: 'local:[locale]:home-page' },
        sources: source,
        layers: () => ({
          next: [{ key: { payload: 'home-page' }, invalidates: [foreign] }],
        }),
      }),
    ).toThrow(/not from this defineRevalidation/)
  })
})
