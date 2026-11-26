import type { CacheMode, Dispatcher } from '@klnap/revalidation'
import { payloadSchema, payloadSource } from '@klnap/revalidation/sources/payload'
import { revalidation, revalidationOrderableHooks } from '@klnap/revalidation/producers/payload'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { http as dispatcherHttp } from '@klnap/revalidation/dispatchers'
import { http } from '@klnap/revalidation/dispatchers/http'
import type { NextConfig } from 'next'
import 'server-only'
import * as v from 'valibot'

const nextConfig: NextConfig = { cacheComponents: true }

const mode: CacheMode = 'expire'
// @ts-expect-error Cache mode must be supported by the public API.
const invalidMode: CacheMode = 'refresh'

const consumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  sources: { [payloadSource]: payloadSchema },
  tags: { page: '[locale]:page:[slug]' },
  paths: { page: '/[locale]/[slug]' },
  rules: ({ tags, paths, on }) => [
    on(
      { source: payloadSource, affected: { type: 'payload.collection', name: 'pages' } },
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
  },
})
revalidation({ dispatcher })
revalidationOrderableHooks()

const billingSource = 'https://billing.example/events'
const billingConsumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  sources: { [billingSource]: v.object({ key: v.string() }) },
  tags: { pricing: 'pricing' },
  rules: ({ tags, on }) => [
    on({ source: billingSource, type: 'com.example.pricing.changed.v1' }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
  ],
})
billingConsumer.tags.pricing()

void mode
void invalidMode
void nextConfig
