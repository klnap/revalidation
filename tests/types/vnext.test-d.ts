import type { CloudEvent, DispatchOutcome, Dispatcher } from '@klnap/revalidation'
import { defineRevalidation, type CacheProfile } from '@klnap/revalidation/consumers/next'
import { resourceChangedEventType } from '@klnap/revalidation'
import { http } from '@klnap/revalidation/dispatchers/http'
import * as v from 'valibot'

const cacheProfile: CacheProfile = { expire: 0 }

const consumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  tags: { article: '[locale]:article:[slug]' },
  paths: { article: '/[locale]/articles/[slug]' },
  profile: 'max',
  rules: ({ tags, on }) => [
    on(
      {
        type: resourceChangedEventType,
        affected: { type: 'payload.collection', name: 'articles' },
      },
      ({ data, affected }) => {
        const operation: 'create' | 'update' | 'delete' = data.operation
        void operation
        return {
          tags: affected.flatMap(({ resource }) =>
            resource.locale && resource.slug
              ? [[tags.article({ locale: resource.locale, slug: resource.slug }), 'max'] as const]
              : [],
          ),
          paths: affected.flatMap(({ resource }) =>
            resource.locale && resource.slug
              ? [[`/${resource.locale}/articles/[slug]`, 'page'] as const]
              : [],
          ),
        }
      },
    ),
  ],
})

defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  tags: { article: '[slug]', articleList: 'articles' },
  paths: { article: '/articles/[slug]', listing: '/articles' },
  rules: ({ tags, paths }) => ({
    'payload.collection.articles': {
      tags: [tags.article, [tags.articleList, { expire: 0 }]],
      paths: [paths.article, [paths.listing, 'page']],
    },
  }),
})

defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  paths: { article: '/articles/[slug]' },
  rules: ({ paths }) => ({
    'payload.collection.articles': {
      // @ts-expect-error Scoped typed paths must remain literal route patterns.
      paths: [[paths.article, 'page']],
    },
  }),
})

consumer.tags.article({ locale: 'en', slug: 'guide' })
// @ts-expect-error Template parameters are required.
consumer.tags.article({ locale: 'en' })
consumer.paths.article({ locale: 'en', slug: 'guide' })

defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  tags: { article: '[slug]' },
  rules: ({ tags, on }) => [
    on(
      {
        type: resourceChangedEventType,
        affected: { type: 'payload.collection', name: 'articles' },
      },
      ({ affected }) => ({
        operations: affected.map(({ resource }) => ({
          layer: 'search',
          value: resource.id,
        })),
        tags: affected.flatMap(({ resource }) =>
          resource.slug ? [tags.article({ slug: resource.slug })] : [],
        ),
      }),
    ),
    on(
      {
        type: resourceChangedEventType,
        affected: { type: 'payload.collection', name: 'articles' },
      },
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
  rules: ({ on }) => [
    // @ts-expect-error Operations must name a configured executor.
    on({ type: resourceChangedEventType }, () => ({
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

const customEventType = 'com.example.pricing.changed.v1'
const customEventConsumer = defineRevalidation({
  secret: 'whsec_c2VjcmV0',
  schemas: { [customEventType]: v.object({ key: v.string() }) },
  tags: { pricing: 'pricing' },
  rules: ({ tags, on }) => [
    on({ type: customEventType }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
  ],
})

const customDispatcher: Dispatcher = {
  async dispatch({ events }) {
    const event: CloudEvent | undefined = events[0]
    void event
    return { status: 'accepted', results: [] }
  },
}

void dispatcher
void customDispatcher
void customEventConsumer
void outcome
void cacheProfile
