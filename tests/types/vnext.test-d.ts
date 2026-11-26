import type { CacheMode, DispatchOutcome, Dispatcher } from '@klnap/revalidation'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { payloadSchema, payloadSource } from '@klnap/revalidation/sources/payload'
import { http } from '@klnap/revalidation/dispatchers/http'

const mode: CacheMode = 'expire'
// @ts-expect-error Unsupported cache modes are rejected.
const invalidMode: CacheMode = 'immediate'

const consumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  sources: { [payloadSource]: payloadSchema },
  tags: { article: '[locale]:article:[slug]' },
  paths: { article: '/[locale]/articles/[slug]' },
  rules: ({ tags, paths, on }) => [
    on(
      { source: payloadSource, affected: { type: 'payload.collection', name: 'articles' } },
      ({ data, affected }) => {
        const operation: 'create' | 'update' | 'delete' = data.operation
        void operation
        return {
          tags: affected.flatMap(({ resource }) =>
            resource.locale && resource.slug
              ? [tags.article({ locale: resource.locale, slug: resource.slug })]
              : [],
          ),
          paths: affected.flatMap(({ resource }) =>
            resource.locale && resource.slug
              ? [paths.article({ locale: resource.locale, slug: resource.slug })]
              : [],
          ),
        }
      },
    ),
  ],
})

consumer.tags.article({ locale: 'en', slug: 'guide' })
// @ts-expect-error Template parameters are required.
consumer.tags.article({ locale: 'en' })
consumer.paths.article({ locale: 'en', slug: 'guide' })

defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  sources: { [payloadSource]: payloadSchema },
  tags: { article: '[slug]' },
  rules: ({ tags, on }) => [
    {
      'payload.collection': {
        articles: ({ affected }) => ({
          operations: affected.map(({ resource }) => ({
            layer: 'search',
            value: resource.id,
          })),
          tags: affected.flatMap(({ resource }) =>
            resource.slug ? [tags.article({ slug: resource.slug })] : [],
          ),
        }),
      },
    },
    on(
      { source: payloadSource, affected: { type: 'payload.collection', name: 'articles' } },
      ({ data }) => ({
        operations: [{ layer: 'search', value: data.resource.id }],
      }),
    ),
  ],
  execute: {
    search: async ({ value, signal, data }) => {
      const operation: 'create' | 'update' | 'delete' = data.operation
      void value
      void operation
      signal.throwIfAborted()
    },
  },
})

defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  sources: { [payloadSource]: payloadSchema },
  rules: ({ on }) => [
    on({ source: payloadSource }, () => ({
      // @ts-expect-error Operations must name a configured executor.
      operations: [{ layer: 'missing', value: null }],
    })),
  ],
  execute: { search: () => {} },
})

const dispatcher: Dispatcher = http({
  targets: {
    website: { url: 'https://example.test/api/revalidate', secret: 'whsec_c2VjcmV0' },
  },
})

const outcome: DispatchOutcome = { status: 'accepted', results: [] }
void dispatcher
void outcome
void mode
void invalidMode
