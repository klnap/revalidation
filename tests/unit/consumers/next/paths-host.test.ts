import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { inspectHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'
import { payloadRevalidationItemSchema } from '../../../../src/sources/payload'

describe('host paths', () => {
  it('collects paths from invalidates object', () => {
    const { runtime } = compileHostRevalidation({
      secret: 's',
      tags: {
        project: '[locale]:project:[slug]',
      },
      paths: {
        projectPage: '/[locale]/work/[slug]',
        projectsIndex: '/[locale]/work',
      },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: ({ item }) => (item as { key: string }).key,
        },
      },
      layers: (t, p) => ({
        next: [
          {
            key: { payload: 'projects' },
            invalidates: {
              tags: [t.project],
              paths: [p.projectPage, p.projectsIndex],
            },
          },
        ],
      }),
    })

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

    expect(result.layers.next?.paths.map((p) => p.value).sort()).toEqual([
      '/en/work',
      '/en/work/tower',
    ])
  })

  it('paths-only rule (no tags)', () => {
    const { runtime } = compileHostRevalidation({
      secret: 's',
      tags: { homePage: '[locale]:home' },
      paths: { homePath: '/[locale]' },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: () => 'home-page',
        },
      },
      layers: (_t, p) => ({
        edge: [{ key: { payload: 'home-page' }, invalidates: { paths: [p.homePath] } }],
      }),
    })

    const result = inspectHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: { operation: 'update', locale: 'pl', key: 'home-page', global: 'home-page' },
      },
      'expire',
      100,
    )

    expect(result.layers.edge?.tags).toEqual([])
    expect(result.layers.edge?.paths.map((p) => p.value)).toEqual(['/pl'])
  })

  it('rejects unknown path ref', () => {
    const foreign = (locale: string) => `/${locale}`
    expect(() =>
      compileHostRevalidation({
        secret: 's',
        tags: { homePage: '[locale]:home' },
        paths: { homePath: '/[locale]' },
        sources: {
          payload: {
            schema: payloadRevalidationItemSchema,
            resolve: () => 'home-page',
          },
        },
        layers: (_t, p) => ({
          next: [
            {
              key: { payload: 'home-page' },
              invalidates: { paths: [foreign as unknown as (typeof p)['homePath']] },
            },
          ],
        }),
      }),
    ).toThrow(/not from this defineRevalidation|unknown path/)
  })
})
