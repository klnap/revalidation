import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { CollectionConfig } from 'payload'

import type { DispatchInput, DispatchOutcome } from '../../src/core/index.js'
import { revalidation } from '../../src/producers/payload/plugin.js'
import { createTestPayload, type TestPayloadHandle } from './helpers/test-payload.js'

const dispatches: DispatchInput[] = []
let nextOutcome: DispatchOutcome = { status: 'accepted', results: [] }
let handle!: TestPayloadHandle

const dispatcher = {
  async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
    dispatches.push(input)
    return nextOutcome
  },
}

const findItems = (start: number) =>
  dispatches
    .slice(start)
    .flatMap((dispatch) => dispatch.events)
    .filter((event) => event.source === 'urn:klnap:revalidation:payload')
    .flatMap((event) => {
      const data = event.data as {
        affected?: Array<{ operation: string; resource: Record<string, unknown> }>
      }
      return (data.affected ?? []).map(({ operation, resource }) => ({
        operation,
        collection: resource.name,
        documentId: resource.id,
        slug: resource.slug,
      }))
    })

const waitForDispatch = async (start: number): Promise<Array<Record<string, unknown>>> => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const items = findItems(start)
    if (items.length) return items
    await Bun.sleep(10)
  }
  throw new Error('Payload revalidation dispatch did not arrive within 10 seconds')
}

describe('Payload revalidation (SQLite integration)', () => {
  beforeAll(async () => {
    const collection: CollectionConfig = {
      slug: 'articles',
      custom: { revalidation: { identifier: 'slug' } },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true },
      ],
    }
    handle = await createTestPayload([collection], [revalidation({ dispatcher })])
  })

  afterAll(async () => {
    await handle?.destroy()
  })

  it('dispatches creates and updates without delaying Payload writes', async () => {
    const dispatchStart = dispatches.length
    const created = await handle.payload.create({
      collection: 'articles',
      data: { title: 'Original', slug: 'original' },
    })
    const createItems = await waitForDispatch(dispatchStart)
    expect(createItems).toContainEqual(
      expect.objectContaining({
        operation: 'create',
        collection: 'articles',
        documentId: String(created.id),
        slug: 'original',
      }),
    )
    expect(await handle.payload.findByID({ collection: 'articles', id: created.id })).toMatchObject(
      { title: 'Original' },
    )

    const updateStart = dispatches.length
    await handle.payload.update({
      collection: 'articles',
      id: created.id,
      data: { title: 'Updated', slug: 'updated' },
    })
    const updateItems = await waitForDispatch(updateStart)
    expect(updateItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'update',
          collection: 'articles',
          documentId: String(created.id),
          slug: 'original',
        }),
        expect.objectContaining({
          operation: 'update',
          collection: 'articles',
          documentId: String(created.id),
          slug: 'updated',
        }),
      ]),
    )
  })

  it('dispatches deletes and keeps writes successful when delivery fails', async () => {
    nextOutcome = {
      status: 'failed',
      results: [
        {
          target: 'website',
          deliveryId: 'wh_test',
          status: 'failed',
          attempts: 1,
          error: { code: 'TEST_FAILURE', message: 'simulated dispatch failure' },
        },
      ],
    }
    const dispatchStart = dispatches.length
    const created = await handle.payload.create({
      collection: 'articles',
      data: { title: 'Keep me', slug: 'keep-me' },
    })
    expect(await handle.payload.findByID({ collection: 'articles', id: created.id })).toMatchObject(
      { title: 'Keep me' },
    )
    expect(await waitForDispatch(dispatchStart)).toContainEqual(
      expect.objectContaining({ operation: 'create', documentId: String(created.id) }),
    )

    nextOutcome = { status: 'accepted', results: [] }
    const deleteStart = dispatches.length
    await handle.payload.delete({ collection: 'articles', id: created.id })
    expect(await waitForDispatch(deleteStart)).toContainEqual(
      expect.objectContaining({
        operation: 'delete',
        collection: 'articles',
        documentId: String(created.id),
      }),
    )
    await expect(
      handle.payload.findByID({ collection: 'articles', id: created.id }),
    ).rejects.toThrow()
  })
})
