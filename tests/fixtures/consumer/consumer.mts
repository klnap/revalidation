import { resourceChangedEventType, type CloudEvent, type Dispatcher } from '@klnap/revalidation'
import { revalidation, revalidationOrderableHooks } from '@klnap/revalidation/producers/payload'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { http as dispatcherHttp } from '@klnap/revalidation/dispatchers'
import { http } from '@klnap/revalidation/dispatchers/http'
import { cacheTag } from 'next/cache'
import type { NextConfig } from 'next'
import type { CollectionConfig, GlobalConfig } from 'payload'
import 'server-only'
import * as v from 'valibot'

const nextConfig: NextConfig = { cacheComponents: true }

const consumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  tags: { page: '[locale]:page:[slug]' },
  paths: { page: '/[locale]/[slug]' },
  rules: ({ tags, paths, on }) => [
    on(
      { type: resourceChangedEventType, affected: { type: 'payload.collection', name: 'pages' } },
      ({ affected }) => ({
        tags: affected.flatMap(({ resource }) =>
          resource.locale && resource.slug
            ? [tags.page({ locale: resource.locale, slug: resource.slug })]
            : [],
        ),
        paths: affected.flatMap(({ resource }) =>
          resource.locale && resource.slug
            ? [paths.page({ locale: resource.locale, slug: resource.slug })]
            : [],
        ),
      }),
    ),
  ],
})
consumer.tags.page({ locale: 'en', slug: 'about' })
// @ts-expect-error Both template parameters are required.
consumer.tags.page({ locale: 'en' })

const dispatcher: Dispatcher = http({
  targets: {
    website: { url: 'https://example.test/revalidate', secret: 'whsec_c2VjcmV0' },
  },
})
dispatcherHttp({
  targets: {
    website: { url: 'https://example.test/revalidate', secret: 'whsec_c2VjcmV0' },
    storefront: { url: 'https://store.example.test/revalidate', secret: 'whsec_c2VjcmV0' },
  },
})
revalidation({ source: 'https://cms.example/revalidation', dispatcher })
revalidation({
  source: 'https://cms.example/revalidation',
  dispatcher: dispatcherHttp({
    targets: {
      website: { url: 'https://example.test/revalidate', secret: 'whsec_c2VjcmV0' },
      storefront: { url: 'https://store.example.test/revalidate', secret: 'whsec_c2VjcmV0' },
    },
  }),
})
revalidationOrderableHooks()

const billingSource = 'https://billing.example/events'
const billingConsumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  allowedSources: [billingSource, 'https://cms.example/revalidation'],
  schemas: { 'com.example.pricing.changed.v1': v.object({ key: v.string() }) },
  tags: { pricing: 'pricing' },
  rules: ({ tags, on }) => [
    on({ type: 'com.example.pricing.changed.v1' }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
    on({ type: resourceChangedEventType }, ({ data }) => {
      const operation: 'create' | 'update' | 'delete' = data.operation
      void operation
      return { tags: [tags.pricing()] }
    }),
  ],
})
billingConsumer.tags.pricing()

const minimalProducer = revalidation({
  source: 'https://cms.example/revalidation',
  dispatcher: http({
    targets: {
      website: {
        url: process.env.REVALIDATION_URL!,
        secret: process.env.REVALIDATION_SECRET!,
      },
    },
  }),
})
const Pages: CollectionConfig = {
  slug: 'pages',
  custom: { revalidation: { identifier: 'routeSlug', excludeFields: ['lastReviewedAt'] } },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'routeSlug', type: 'text', localized: true, required: true },
    { name: 'lastReviewedAt', type: 'date' },
  ],
}
const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  custom: { revalidation: true },
  fields: [{ name: 'announcement', type: 'text', localized: true }],
}
const payloadPlugins = [minimalProducer]

const minimalConsumer = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: {
    projects: '[locale]:projects',
    project: '[locale]:project:[slug]',
    homepage: '[locale]:homepage',
    navigation: '[locale]:navigation',
    redirects: 'redirects',
  },
  paths: {
    project: '/[locale]/work/[slug]',
  },
  rules: ({ tags, paths }) => ({
    'payload.collection.projects': {
      tags: [tags.projects, tags.project, tags.homepage],
      paths: [paths.project],
    },
    'payload.global.navigation': [tags.navigation, tags.homepage],
    'payload.collection.redirects': [tags.redirects],
  }),
})
minimalConsumer.tags.project({ locale: 'pl', slug: 'example' })
minimalConsumer.paths.project({ locale: 'pl', slug: 'example' })
minimalConsumer.tags.redirects()

export const { tags, paths, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: {
    pages: '[locale]:pages',
    page: '[locale]:page:[slug]',
  },
  paths: {
    page: '/[locale]/[slug]',
  },
  rules: ({ tags, paths }) => ({
    'payload.collection.pages': {
      tags: [tags.pages, tags.page],
      paths: [paths.page],
    },
  }),
})
tags.page({ locale: 'pl', slug: 'about' })
paths.page({ locale: 'pl', slug: 'about' })
declare function loadPage(locale: string, slug: string): Promise<unknown>
export async function getCachedPage(locale: string, slug: string) {
  'use cache'
  cacheTag(tags.page({ locale, slug }))
  return loadPage(locale, slug)
}
void POST

const resourceChange: CloudEvent = {
  specversion: '1.0',
  id: crypto.randomUUID(),
  source: 'https://commerce.example.com',
  type: resourceChangedEventType,
  datacontenttype: 'application/json',
  data: {
    operation: 'update',
    resource: { type: 'commerce.product', id: 'sku-1' },
    affected: [
      {
        operation: 'update',
        resource: { type: 'commerce.product', id: 'sku-1' },
      },
    ],
  },
}
void resourceChange
const customProducerDispatcher = http({
  targets: {
    website: {
      url: 'https://example.test/revalidate',
      secret: 'whsec_c2VjcmV0',
    },
  },
})
void customProducerDispatcher.dispatch({ events: [resourceChange] })

declare function updateProductIndex(ids: string[], options: { signal: AbortSignal }): Promise<void>
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  rules: ({ on }) => [
    on(
      {
        type: resourceChangedEventType,
        affected: { type: 'payload.collection', name: 'products' },
      },
      ({ affected }) => ({
        operations: [
          {
            layer: 'index',
            value: affected.flatMap(({ resource }) => (resource.id ? [resource.id] : [])),
          },
        ],
        tags: ['products'],
      }),
    ),
  ],
  execute: {
    index: async ({ value, signal }) => {
      if (!isStringArray(value)) throw new TypeError('Expected product IDs.')
      await updateProductIndex(value, { signal })
    },
  },
})

void nextConfig
void Pages
void SiteSettings
void payloadPlugins
void minimalProducer
