import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CollectionConfig } from 'payload'
import { Webhook } from 'standardwebhooks'
import { defineRevalidation } from '../../src/consumers/next/define-revalidation.js'
import { http } from '../../src/dispatchers/http/index.js'
import { revalidationOrderableHooks } from '../../src/producers/payload/lifecycle/orderable-hooks.js'
import { revalidation } from '../../src/producers/payload/plugin.js'
import { resourceChangedEventType } from '../../src/core/resource-changed-schema.js'

const orderableDir = resolve(
  process.env.PAYLOAD_ORDERABLE_PACKAGE_DIR ??
    join(import.meta.dir, '../../../../stolbek/packages/payload-orderable'),
)
const databaseUrl = process.env.PAYLOAD_ORDERABLE_PKG_TEST_DATABASE_URL
const enabled =
  Boolean(databaseUrl) && existsSync(join(orderableDir, 'tests/integration/fixtures.ts'))
const integration = enabled ? describe : describe.skip
const source = 'https://cms.example/revalidation'
const secret = `whsec_${Buffer.from('orderable-e2e-test-secret').toString('base64')}`
const user = {
  id: 'revalidation-orderable-test-user',
  collection: 'users',
  email: 'test@example.com',
}

type Received = {
  path: string
  body: string
  events: Array<Record<string, unknown>>
  status: number
  committedBatch?: string
}

type CommitRecord = {
  batchId: string
  collectionSlug: string
  orderScope: 'global' | 'locale'
  locale?: string
  persisted: boolean
}

let payload: Awaited<ReturnType<typeof import('payload')['getPayload']>>
let server: Server
let endpointUrl = ''
let consumerPost: (request: Request) => Promise<Response>
let localReq: typeof import('payload')['createLocalReq']
let digestOf: (rows: { id: string; key: string }[], scope: Record<string, unknown>) => string
let failDocumentId: string | undefined
let failDelivery = false
const received: Received[] = []
const commits: CommitRecord[] = []
const rollbacks: unknown[] = []

const readRequest = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

const startReceiver = async () => {
  server = createServer(async (request, response) => {
    const body = await readRequest(request)
    const headers = {
      'webhook-id': String(request.headers['webhook-id'] ?? ''),
      'webhook-timestamp': String(request.headers['webhook-timestamp'] ?? ''),
      'webhook-signature': String(request.headers['webhook-signature'] ?? ''),
    }
    let events: Array<Record<string, unknown>> = []
    let status = 500
    let committedBatch: string | undefined
    try {
      new Webhook(secret).verify(body, headers)
      const parsed = JSON.parse(body) as unknown
      events = (Array.isArray(parsed) ? parsed : [parsed]) as Array<Record<string, unknown>>
      const currentCommit = commits.at(-1)
      if (currentCommit) committedBatch = currentCommit.batchId
      const result = await consumerPost(
        new Request(`http://localhost${request.url}`, {
          method: 'POST',
          headers: Object.fromEntries(
            Object.entries(request.headers).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          ),
          body,
        }),
      )
      status = request.url === '/fail' && failDelivery ? 503 : result.status
    } catch {
      status = 400
    }
    received.push({
      path: request.url ?? '/',
      body,
      events,
      status,
      ...(committedBatch ? { committedBatch } : {}),
    })
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(status >= 500 ? '{"error":"receiver failed"}' : '{"ok":true}')
  })
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected an IPv4 test server')
  endpointUrl = `http://127.0.0.1:${address.port}`
}

const seed = async (collection: 'items' | 'catalog', locale: 'pl' | 'en') => {
  const { docs } = await payload.find({
    collection,
    where: { id: { exists: true } },
    limit: 100,
    pagination: false,
    overrideAccess: true,
  })
  for (const doc of docs) {
    await payload.delete({ collection, id: doc.id, overrideAccess: true })
  }
  const ids: string[] = []
  for (const slug of ['alpha', 'bravo', 'charlie']) {
    const doc = await payload.create({
      collection,
      locale,
      draft: false,
      overrideAccess: true,
      data: { title: slug, slug, _status: 'published' },
    })
    ids.push(String(doc.id))
    if (collection === 'catalog' && locale === 'pl') {
      await payload.update({
        collection,
        id: doc.id,
        locale: 'en',
        draft: false,
        overrideAccess: true,
        data: { title: `en-${slug}`, slug: `en-${slug}`, _status: 'published' },
      })
    }
  }
  await Bun.sleep(1_100)
  received.length = 0
  commits.length = 0
  rollbacks.length = 0
  return ids
}

const readOrder = async (collection: 'items' | 'catalog', locale: 'pl' | 'en') => {
  const field = collection === 'items' ? '_order' : 'localeOrder'
  const { docs } = await payload.find({
    collection,
    locale,
    draft: false,
    sort: field,
    limit: 100,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((doc) => String(doc.slug))
}

const reorder = async (input: {
  collection: 'items' | 'catalog'
  moving: string[]
  target: string
  locale: 'pl' | 'en'
  field: '_order' | 'localeOrder'
  direction: 'less' | 'greater'
}) => {
  const current = await payload.find({
    collection: input.collection,
    where: { [input.field]: { exists: true } },
    locale: input.locale,
    fallbackLocale: false,
    draft: false,
    sort: [input.field, 'id'],
    limit: 100,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const target = await payload.findByID({
    collection: input.collection,
    id: input.target,
    locale: input.locale,
    draft: false,
    depth: 0,
    overrideAccess: true,
  })
  const request = (await localReq({ user }, payload)) as Awaited<
    ReturnType<typeof import('payload')['createLocalReq']>
  >
  Object.assign(request, {
    json: async () => ({
      collectionSlug: input.collection,
      orderableFieldName: input.field,
      docsToMove: input.moving,
      newKeyWillBe: input.direction,
      locale: input.field === 'localeOrder' ? input.locale : undefined,
      expectedDigest: digestOf(
        current.docs.map((doc) => ({
          id: String(doc.id),
          key: String(doc[input.field]),
        })),
        {
          collectionSlug: input.collection,
          field: input.field,
          locale: input.field === 'localeOrder' ? input.locale : undefined,
        },
      ),
      target: { id: String(target.id), key: String(target[input.field]) },
    }),
  })
  const endpoint = payload.config.endpoints.find(({ path }) => path === '/orderable/reorder')
  if (!endpoint) throw new Error('The real orderable reorder endpoint was not registered')
  const requestStart = received.length
  const commitStart = commits.length
  try {
    const result = await endpoint.handler(request)
    return {
      status: result.status,
      body: await result.clone().text(),
      requestStart,
      commitStart,
    }
  } catch (error) {
    return {
      status: (error as { status?: number }).status ?? 500,
      body: error instanceof Error ? error.message : String(error),
      requestStart,
      commitStart,
    }
  }
}

integration('real Payload orderable → revalidation HTTP integration (PostgreSQL)', () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('PAYLOAD_ORDERABLE_PKG_TEST_DATABASE_URL is required')
    const orderableRequire = createRequire(join(orderableDir, 'package.json'))
    const { orderable } = await import(pathToFileURL(join(orderableDir, 'src/index.ts')).href)
    const { postgresAdapter } = await import(
      pathToFileURL(orderableRequire.resolve('@payloadcms/db-postgres')).href
    )
    const payloadRuntime = (await import(
      pathToFileURL(orderableRequire.resolve('payload')).href
    )) as typeof import('payload')
    localReq = payloadRuntime.createLocalReq
    digestOf = (await import(pathToFileURL(join(orderableDir, 'src/reorder/snapshot.ts')).href))
      .digestOf

    const hooks = revalidationOrderableHooks()
    const instrumentedHooks = {
      beforeWrite: hooks.beforeWrite,
      onCommitted: async (
        event: {
          batchId: string
          collectionSlug: string
          orderScope: 'global' | 'locale'
          locale?: string
          movedIds: string[]
          orderValues: string[]
        },
        request: { payload: typeof payload; context?: Record<string, unknown> },
      ) => {
        const record: CommitRecord = {
          batchId: event.batchId,
          collectionSlug: event.collectionSlug,
          orderScope: event.orderScope,
          ...(event.locale ? { locale: event.locale } : {}),
          persisted: false,
        }
        const field = event.orderScope === 'global' ? '_order' : 'localeOrder'
        const committedDoc = await request.payload.findByID({
          collection: event.collectionSlug,
          id: event.movedIds[0]!,
          locale: event.locale ?? 'pl',
          draft: false,
          depth: 0,
          overrideAccess: true,
        })
        record.persisted = String(committedDoc[field]) === event.orderValues[0]
        commits.push(record)
        await hooks.onCommitted(event, request)
      },
      onRolledBack: (error: unknown, request: Parameters<typeof hooks.onRolledBack>[1]) => {
        rollbacks.push(error)
        return hooks.onRolledBack(error, request)
      },
    }
    await startReceiver()
    const dispatcher = http({
      allowInsecure: true,
      retries: 0,
      timeoutMs: 2_000,
      deadlineMs: 2_000,
      targets: {
        primary: { url: `${endpointUrl}/primary`, secret },
        secondary: { url: `${endpointUrl}/fail`, secret },
      },
    })
    consumerPost = defineRevalidation({
      secret,
      rules: () => [],
    }).POST

    const access = {
      read: () => true,
      create: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
      update: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
    }
    const collections: CollectionConfig[] = [
      {
        slug: 'items',
        orderable: true,
        custom: { revalidation: { identifier: 'slug' } },
        access,
        hooks: {
          beforeChange: [
            ({ originalDoc }) => {
              if (failDocumentId && String(originalDoc?.id) === failDocumentId) {
                throw new Error('orderable rollback fixture')
              }
            },
          ],
        },
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'slug', type: 'text', required: true },
        ],
      },
      {
        slug: 'catalog',
        orderable: true,
        custom: { revalidation: { identifier: 'slug' } },
        access,
        fields: [
          { name: 'title', type: 'text', required: true, localized: true },
          { name: 'slug', type: 'text', required: true, localized: true },
        ],
      },
    ]
    const config = await payloadRuntime.buildConfig({
      secret: 'orderable-revalidation-integration-secret',
      db: postgresAdapter({
        idType: 'uuid',
        allowIDOnCreate: true,
        pool: { connectionString: databaseUrl },
        push: true,
        migrationDir: join(orderableDir, 'tests/integration/migrations'),
      }),
      collections,
      localization: {
        locales: ['pl', 'en'],
        defaultLocale: 'pl',
        fallback: false,
      },
      plugins: [
        orderable({
          hooks: instrumentedHooks,
          collections: { catalog: { orderScope: 'locale' } },
        }),
        revalidation({ source, dispatcher }),
      ],
      admin: { disable: true },
      typescript: { autoGenerate: false },
    })
    payload = await payloadRuntime.getPayload({
      config: config as never,
      key: import.meta.dir,
    })
    failDelivery = false
  }, 120_000)

  afterAll(async () => {
    await payload?.db.destroy?.()
    await new Promise<void>((resolveClose, reject) =>
      server?.close((error) => (error ? reject(error) : resolveClose())),
    )
  })

  it('commits global and localized reorders before emitting validated signed events', async () => {
    const itemIds = await seed('items', 'pl')
    expect(
      payload.config.collections
        .find(({ slug }) => slug === 'items')
        ?.fields.some((field) => 'localized' in field && field.localized === true),
    ).toBe(false)
    const first = await reorder({
      collection: 'items',
      moving: [itemIds[2]!],
      target: itemIds[0]!,
      locale: 'pl',
      field: '_order',
      direction: 'less',
    })
    if (first.status !== 200) throw new Error(`Reorder failed: ${first.status} ${first.body}`)
    expect(await readOrder('items', 'pl')).toEqual(['charlie', 'alpha', 'bravo'])
    expect(await readOrder('items', 'en')).toEqual(['charlie', 'alpha', 'bravo'])
    expect(commits.slice(first.commitStart)).toHaveLength(1)
    expect(commits[first.commitStart]).toMatchObject({
      collectionSlug: 'items',
      orderScope: 'global',
      persisted: true,
    })
    const globalRequests = received.slice(first.requestStart)
    expect(globalRequests).toHaveLength(2)
    expect(
      globalRequests.every(
        ({ committedBatch }) => committedBatch === commits[first.commitStart]!.batchId,
      ),
    ).toBe(true)
    expect(
      globalRequests.every(
        ({ status, committedBatch }) =>
          status === 200 && committedBatch === commits[first.commitStart]!.batchId,
      ),
    ).toBe(true)
    const globalEvent = globalRequests[0]!.events[0]!
    const globalData = globalEvent.data as {
      operation: string
      resource: Record<string, unknown>
      affected: { operation: string; resource: Record<string, unknown> }[]
    }
    expect(globalEvent.source).toBe(source)
    expect(globalEvent.type).toBe(resourceChangedEventType)
    expect(globalEvent.specversion).toBe('1.0')
    expect(typeof globalEvent.id).toBe('string')
    expect(globalData.operation).toBe('update')
    expect(globalData.resource).toMatchObject({
      type: 'payload.collection',
      name: 'items',
      id: itemIds[2],
    })
    expect(globalData.affected.every(({ operation }) => operation === 'update')).toBe(true)
    expect(globalData.affected.map(({ resource }) => resource.id)).toContain(itemIds[2])
    expect(
      globalData.affected.some(
        ({ resource }) => resource.id === itemIds[2] && resource.slug === 'charlie',
      ),
    ).toBe(true)

    const repeat = await reorder({
      collection: 'items',
      moving: [itemIds[1]!],
      target: itemIds[0]!,
      locale: 'pl',
      field: '_order',
      direction: 'less',
    })
    expect(repeat.status).toBe(200)
    expect(commits.slice(repeat.commitStart)).toHaveLength(1)
    const repeatedRequests = received.slice(repeat.requestStart)
    expect(repeatedRequests).toHaveLength(2)
    expect(
      repeatedRequests.every(
        ({ committedBatch }) => committedBatch === commits[repeat.commitStart]!.batchId,
      ),
    ).toBe(true)

    const catalogIds = await seed('catalog', 'pl')
    const localized = await reorder({
      collection: 'catalog',
      moving: [catalogIds[2]!],
      target: catalogIds[0]!,
      locale: 'en',
      field: 'localeOrder',
      direction: 'less',
    })
    expect(localized.status).toBe(200)
    expect(await readOrder('catalog', 'en')).toEqual(['en-charlie', 'en-alpha', 'en-bravo'])
    expect(commits.slice(localized.commitStart)).toMatchObject([
      { collectionSlug: 'catalog', orderScope: 'locale', locale: 'en', persisted: true },
    ])
    expect(
      received
        .slice(localized.requestStart)
        .every(({ committedBatch }) => committedBatch === commits[localized.commitStart]!.batchId),
    ).toBe(true)
    expect(received.slice(localized.requestStart)).toHaveLength(2)
    const localizedData = received[localized.requestStart]!.events[0]!.data as {
      operation: string
      resource: Record<string, unknown>
      affected: { operation: string; resource: Record<string, unknown> }[]
    }
    expect(localizedData.operation).toBe('update')
    expect(localizedData.resource).toMatchObject({
      type: 'payload.collection',
      name: 'catalog',
      id: catalogIds[2],
      locale: 'en',
    })
    expect(localizedData.affected.every(({ operation }) => operation === 'update')).toBe(true)
    expect(
      localizedData.affected
        .filter(({ resource }) => resource.id === catalogIds[2])
        .map(({ resource }) => resource.locale),
    ).toEqual(['en'])
  })

  it('discards queued events after rollback and preserves committed reorder when delivery fails', async () => {
    const ids = await seed('items', 'pl')
    const originalOrder = await readOrder('items', 'pl')
    failDocumentId = ids[2]
    const rollback = await reorder({
      collection: 'items',
      moving: [ids[1]!, ids[2]!],
      target: ids[0]!,
      locale: 'pl',
      field: '_order',
      direction: 'less',
    })
    failDocumentId = undefined
    expect(rollback.status).toBe(500)
    expect(rollbacks).toHaveLength(1)
    expect(received.slice(rollback.requestStart)).toHaveLength(0)
    expect(await readOrder('items', 'pl')).toEqual(originalOrder)

    failDelivery = true
    const committed = await reorder({
      collection: 'items',
      moving: [ids[2]!],
      target: ids[0]!,
      locale: 'pl',
      field: '_order',
      direction: 'less',
    })
    failDelivery = false
    expect(committed.status).toBe(200)
    expect(await readOrder('items', 'pl')).toEqual(['charlie', 'alpha', 'bravo'])
    expect(commits.slice(committed.commitStart)).toMatchObject([{ persisted: true }])
    const delivered = received.slice(committed.requestStart)
    expect(delivered).toHaveLength(2)
    expect(
      delivered.every(
        ({ committedBatch }) => committedBatch === commits[committed.commitStart]!.batchId,
      ),
    ).toBe(true)
    expect(delivered.map(({ path, status }) => [path, status])).toEqual([
      ['/primary', 200],
      ['/fail', 503],
    ])
    expect(delivered.every(({ events }) => events.length === 1)).toBe(true)
  })
})
