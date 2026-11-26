import { createPipeline, type CacheMode, type Dispatcher } from '@klnap/revalidation'
import {
  payloadRevalidationSource,
  payloadRevalidationItemSchema,
} from '@klnap/revalidation/sources/payload'
import { revalidation, revalidationOrderableHooks } from '@klnap/revalidation/producers/payload'
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next'
import { defineRevalidationTags } from '@klnap/revalidation/consumers/next/tags'
import { http as dispatcherHttp } from '@klnap/revalidation/dispatchers'
import { http } from '@klnap/revalidation/dispatchers/http'

const mode: CacheMode = 'expire'
// @ts-expect-error Cache mode must be supported by the public API.
const invalidMode: CacheMode = 'refresh'

const { tags } = defineRevalidationTags({
  tags: { page: '[locale]:page:[slug]' },
})
tags.page({ locale: 'en', slug: 'about' })
// @ts-expect-error Both template parameters are required.
tags.page({ locale: 'en' })

const dispatcher: Dispatcher = http({
  target: { url: 'https://example.test/revalidate', secret: 'secret' },
})
dispatcherHttp({ target: { url: 'https://example.test/revalidate', secret: 'secret' } })

revalidation({ dispatcher })
revalidationOrderableHooks()
defineRevalidation({
  secret: 'secret',
  resolve: (event) => event.key ?? invalidKey(),
  rules: ({ tags }) => ({ pages: [tags.page] }),
  tags: { page: '[locale]:page:[slug]' },
})

void createPipeline
void payloadRevalidationSource
void payloadRevalidationItemSchema
void mode
void invalidMode
