import { describe, expect, it } from 'bun:test'

import { compileHostRevalidation } from '../../../../src/consumers/next/compile-revalidation-host'
import { inspectHostEnvelope } from '../../../../src/consumers/next/process-host-envelope'
import { payloadRevalidationItemSchema } from '../../../../src/sources/payload'

const payloadWire = {
  resolve: (event: { collection?: string; global?: string }) =>
    event.collection ?? event.global ?? '',
}

describe('simple rules', () => {
  const manual = () =>
    compileHostRevalidation({
      secret: 's',
      tags: {
        project: '[locale]:project:[slug]',
        workPage: '[locale]:work-page',
      },
      sources: {
        payload: {
          schema: payloadRevalidationItemSchema,
          resolve: ({ item }) => {
            const d = item as { key: string }
            return d.key
          },
        },
      },
      layers: ({ tags: t, paths: _p }) => ({
        next: [
          {
            key: { payload: 'projects' },
            invalidates: [t.project, t.workPage],
          },
        ],
      }),
    })

  const lowEffortFlat = () =>
    compileHostRevalidation({
      secret: 's',
      ...payloadWire,
      tags: {
        project: '[locale]:project:[slug]',
        workPage: '[locale]:work-page',
      },
      rules: ({ tags: tag }) => ({
        projects: [tag.project, tag.workPage],
      }),
    })

  it('a flat rules map expands to the Next.js layer', () => {
    const envelope = {
      source: 'payload',
      data: {
        operation: 'update',
        locale: 'en',
        key: 'projects',
        collection: 'projects',
        slug: 'tower',
      },
    }

    const manualResult = inspectHostEnvelope(manual().runtime, envelope, 'expire', 100)
    const lowResult = inspectHostEnvelope(lowEffortFlat().runtime, envelope, 'expire', 100)

    expect(lowResult.cacheKeys).toEqual(manualResult.cacheKeys)
    expect(lowResult.layers.next?.tags.map((t) => t.value).sort()).toEqual(
      manualResult.layers.next?.tags.map((t) => t.value).sort(),
    )
  })

  it('rules.layers supports custom cache layers', () => {
    const { runtime } = compileHostRevalidation({
      secret: 's',
      ...payloadWire,
      tags: { homePage: '[locale]:home' },
      paths: { homePath: '/[locale]' },
      rules: {
        layers: {
          next: ({ tags }) => ({ 'home-page': [tags.homePage] }),
          cdn: ({ paths }) => ({ 'home-page': { paths: [paths.homePath] } }),
        },
      },
    })

    const result = inspectHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: { operation: 'update', locale: 'en', key: 'home-page', global: 'home-page' },
      },
      'expire',
      100,
    )

    expect(result.layers.next?.tags.map((t) => t.value)).toEqual(['en:home'])
    expect(result.layers.cdn?.paths.map((p) => p.value)).toEqual(['/en'])
  })

  it('maps custom parameters and applies per-rule modes over the global mode', () => {
    const { runtime, config } = compileHostRevalidation({
      secret: 's',
      mode: 'expire',
      tags: {
        page: '[locale]:page:[projectSlug]',
        settings: 'settings',
      },
      paths: { page: '/[locale]/[projectSlug]' },
      resolve: (event) => event.key ?? '',
      params: (event) => ({
        locale: event.locale,
        projectSlug: event.slug,
      }),
      rules: ({ tags, paths }) => ({
        pages: {
          tags: [tags.page],
          paths: [paths.page],
          mode: 'stale',
        },
        settings: [tags.settings],
      }),
    })
    const result = inspectHostEnvelope(
      runtime,
      {
        source: 'payload',
        data: [{ key: 'pages', locale: 'fr', slug: 'bonjour' }, { key: 'settings' }],
      },
      config.mode ?? 'expire',
      100,
    )

    expect(result.layers.next?.tags).toEqual([
      { value: 'fr:page:bonjour', mode: 'stale' },
      { value: 'settings', mode: 'expire' },
    ])
    expect(result.layers.next?.paths).toEqual([{ value: '/fr/bonjour', mode: 'stale' }])
  })

  it('rejects mixing simple rules with sources', () => {
    expect(() =>
      compileHostRevalidation({
        secret: 's',
        tags: { homePage: '[locale]:home' },
        sources: {
          payload: {
            schema: payloadRevalidationItemSchema,
            resolve: () => 'home-page',
          },
        },
        rules: () => ({ 'home-page': [] }),
        resolve: () => 'home-page',
      }),
    ).toThrow(/rules.*or sources/)
  })

  it('requires resolve', () => {
    expect(() =>
      compileHostRevalidation({
        secret: 's',
        tags: { homePage: '[locale]:home' },
        rules: () => ({}),
      } as unknown as import('../../../../src/consumers/next/host-types').DefineRevalidationInput),
    ).toThrow(/resolve/)
  })

  it('rejects top-level layers in low-effort', () => {
    expect(() =>
      compileHostRevalidation({
        secret: 's',
        tags: { homePage: '[locale]:home' },
        layers: {
          next: () => ({}),
        },
        rules: () => ({}),
        resolve: () => 'home-page',
      } as unknown as import('../../../../src/consumers/next/host-types').DefineRevalidationInput),
    ).toThrow(/rules\.layers/)
  })
})
