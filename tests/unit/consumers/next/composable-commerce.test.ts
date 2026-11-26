import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Webhook } from 'standardwebhooks'
import * as v from 'valibot'
import { payloadSchema, payloadSource } from '../../../../src/sources/payload/index.js'

const executionOrder: string[] = []
const revalidateTag = mock((tag: string) => {
  executionOrder.push(`next:${tag}`)
})
const revalidatePath = mock((_path: string) => {})
mock.module('next/cache.js', () => ({ revalidateTag, revalidatePath }))
const { defineRevalidation } = await import('../../../../src/consumers/next/index.js')

const secret = `whsec_${Buffer.from('commerce-test-secret').toString('base64')}`
const medusaSource = 'https://commerce.example/events'
const operationSchema = v.picklist(['create', 'update', 'delete'])
const medusaSchema = v.object({
  operation: operationSchema,
  resource: v.object({
    type: v.string(),
    name: v.optional(v.string()),
    id: v.optional(v.string()),
    slug: v.optional(v.string()),
    locale: v.optional(v.string()),
  }),
  affected: v.array(
    v.object({
      operation: operationSchema,
      resource: v.object({
        type: v.string(),
        name: v.optional(v.string()),
        id: v.optional(v.string()),
        slug: v.optional(v.string()),
        locale: v.optional(v.string()),
      }),
    }),
  ),
  productId: v.string(),
})

type ProjectionOperation = {
  productIds: string[]
  source: 'editorial' | 'commerce'
}

const makeEvent = (source: string, type: string, data: unknown, id: string) => ({
  specversion: '1.0',
  id: `rev_${id}`,
  source,
  type,
  datacontenttype: 'application/json',
  data,
})

const send = async (POST: (request: Request) => Promise<Response>, event: unknown) => {
  const body = JSON.stringify(event)
  const id = `wh_${crypto.randomUUID()}`
  const timestamp = new Date()
  return POST(
    new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: {
        'content-type': 'application/cloudevents+json',
        'webhook-id': id,
        'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'webhook-signature': new Webhook(secret).sign(id, timestamp, body),
      },
      body,
    }),
  )
}

describe('composable commerce projection', () => {
  const editorial = new Map<string, { title: string }>()
  const commerce = new Map<string, { price: number }>()
  const meilisearchReadModel = new Map<string, { title: string; price: number }>()
  let failIndexing = false

  beforeEach(() => {
    editorial.clear()
    commerce.clear()
    meilisearchReadModel.clear()
    executionOrder.length = 0
    failIndexing = false
    revalidateTag.mockClear()
    revalidatePath.mockClear()
  })

  const makeConsumer = () =>
    defineRevalidation({
      secret,
      sources: {
        [payloadSource]: payloadSchema,
        [medusaSource]: medusaSchema,
      },
      tags: { product: '[locale]:product:[slug]' },
      rules: ({ tags, on }) => [
        on(
          {
            source: payloadSource,
            affected: { type: 'payload.collection', name: 'products' },
          },
          ({ affected }) => ({
            operations: [
              {
                layer: 'meilisearch',
                value: {
                  source: 'editorial',
                  productIds: [
                    ...new Set(
                      affected.flatMap(({ resource }) => (resource.id ? [resource.id] : [])),
                    ),
                  ],
                } satisfies ProjectionOperation,
              },
            ],
            tags: affected.flatMap(({ resource }) =>
              resource.locale && resource.slug
                ? [tags.product({ locale: resource.locale, slug: resource.slug })]
                : [],
            ),
          }),
        ),
        on(
          {
            source: medusaSource,
            affected: { type: 'medusa.product' },
          },
          ({ data, affected }) => ({
            operations: [
              {
                layer: 'meilisearch',
                value: {
                  source: 'commerce',
                  productIds: [data.productId],
                } satisfies ProjectionOperation,
              },
            ],
            tags: affected.flatMap(({ resource }) =>
              resource.locale && resource.slug
                ? [tags.product({ locale: resource.locale, slug: resource.slug })]
                : [],
            ),
          }),
        ),
      ],
      execute: {
        meilisearch: async ({ value }) => {
          const operation = value as ProjectionOperation
          for (const productId of operation.productIds) {
            if (failIndexing) throw new Error('private Meilisearch failure')
            const editorialData = editorial.get(productId)
            const commerceData = commerce.get(productId)
            if (!editorialData || !commerceData) throw new Error('projection source is missing')
            meilisearchReadModel.set(productId, {
              title: editorialData.title,
              price: commerceData.price,
            })
            executionOrder.push(`indexed:${operation.source}:${productId}`)
          }
        },
      },
    })

  it('projects Payload and Medusa changes before Next invalidation, including old and new identifiers', async () => {
    const { POST } = makeConsumer()
    editorial.set('prod_1', { title: 'Wool coat' })
    commerce.set('prod_1', { price: 49 })

    const payloadResult = await send(
      POST,
      makeEvent(
        payloadSource,
        'com.klnap.revalidation.resource.changed.v1',
        {
          operation: 'update',
          resource: {
            type: 'payload.collection',
            name: 'products',
            id: 'prod_1',
            locale: 'en',
            slug: 'winter-coat',
          },
          affected: [
            {
              operation: 'update',
              resource: {
                type: 'payload.collection',
                name: 'products',
                id: 'prod_1',
                locale: 'en',
                slug: 'coat',
                identifiers: { sku: 'OLD-1' },
              },
            },
            {
              operation: 'update',
              resource: {
                type: 'payload.collection',
                name: 'products',
                id: 'prod_1',
                locale: 'en',
                slug: 'winter-coat',
                identifiers: { sku: 'NEW-1' },
              },
            },
          ],
        },
        'payload-product-update',
      ),
    )

    expect(payloadResult.status).toBe(200)
    expect(meilisearchReadModel.get('prod_1')).toEqual({ title: 'Wool coat', price: 49 })
    expect(executionOrder).toEqual([
      'indexed:editorial:prod_1',
      'next:en:product:coat',
      'next:en:product:winter-coat',
    ])
    expect(revalidateTag).toHaveBeenCalledWith('en:product:coat', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith('en:product:winter-coat', { expire: 0 })

    commerce.set('prod_1', { price: 55 })
    const medusaResult = await send(
      POST,
      makeEvent(
        medusaSource,
        'com.example.medusa.product.updated.v1',
        {
          operation: 'update',
          resource: { type: 'medusa.product', id: 'prod_1', slug: 'winter-coat', locale: 'en' },
          affected: [
            {
              operation: 'update',
              resource: {
                type: 'medusa.product',
                id: 'prod_1',
                slug: 'winter-coat',
                locale: 'en',
              },
            },
          ],
          productId: 'prod_1',
        },
        'medusa-product-update',
      ),
    )

    expect(medusaResult.status).toBe(200)
    expect(meilisearchReadModel.get('prod_1')).toEqual({ title: 'Wool coat', price: 55 })
    expect(executionOrder).toEqual([
      'indexed:editorial:prod_1',
      'next:en:product:coat',
      'next:en:product:winter-coat',
      'indexed:commerce:prod_1',
      'next:en:product:winter-coat',
    ])
  })

  it('does not invalidate Next.js caches when indexing fails', async () => {
    const { POST } = makeConsumer()
    editorial.set('prod_1', { title: 'Wool coat' })
    commerce.set('prod_1', { price: 49 })
    meilisearchReadModel.set('prod_1', { title: 'Old coat', price: 39 })
    failIndexing = true

    const response = await send(
      POST,
      makeEvent(
        payloadSource,
        'com.klnap.revalidation.resource.changed.v1',
        {
          operation: 'update',
          resource: { type: 'payload.collection', name: 'products', id: 'prod_1' },
          affected: [
            {
              operation: 'update',
              resource: {
                type: 'payload.collection',
                name: 'products',
                id: 'prod_1',
                locale: 'en',
                slug: 'old-coat',
              },
            },
            {
              operation: 'update',
              resource: {
                type: 'payload.collection',
                name: 'products',
                id: 'prod_1',
                locale: 'en',
                slug: 'new-coat',
              },
            },
          ],
        },
        'payload-index-failure',
      ),
    )

    expect(response.status).toBe(500)
    expect(meilisearchReadModel.get('prod_1')).toEqual({ title: 'Old coat', price: 39 })
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('private Meilisearch failure')
  })
})
