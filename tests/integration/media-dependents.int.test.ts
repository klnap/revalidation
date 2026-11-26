import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DispatchInput } from '../../src/core/index.js'
import { resolveMediaDependentChanges } from '../../src/producers/payload/media/resolve-media-dependents.js'
import { revalidation } from '../../src/producers/payload/plugin.js'
import { createTestPayload, type TestPayloadHandle } from './helpers/test-payload.js'

const dispatches: DispatchInput[] = []
const dispatcher = {
  async dispatch(input: DispatchInput) {
    const isPaginationFixture = input.events.some((event) => {
      const affected = (event.data as { affected?: { resource: { slug?: string } }[] }).affected
      return affected?.some(({ resource }) => resource.slug?.startsWith('pagination-')) ?? false
    })
    if (!isPaginationFixture) dispatches.push(input)
    return { status: 'accepted' as const, results: [] }
  },
}
let handle!: TestPayloadHandle
let mediaUploadDir = ''

const dependentSlugs = (from: number) =>
  dispatches
    .slice(from)
    .flatMap((d) => d.events)
    .flatMap((event) =>
      ((event.data as { affected?: { resource: { slug?: string } }[] }).affected ?? []).map(
        ({ resource }) => resource.slug,
      ),
    )

const waitFor = async (from: number, slug: string) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (dependentSlugs(from).includes(slug)) return
    await Bun.sleep(25)
  }
  throw new Error(`no dispatch for ${slug}`)
}

describe('media-dependent revalidation (SQLite integration)', () => {
  beforeAll(async () => {
    mediaUploadDir = mkdtempSync(join(tmpdir(), 'revalidation-media-'))
    handle = await createTestPayload(
      [
        {
          slug: 'media',
          upload: { staticDir: mediaUploadDir },
          fields: [{ name: 'alt', type: 'text' }],
        },
        {
          slug: 'posts',
          custom: { revalidation: { identifier: 'slug' } },
          fields: [
            { name: 'slug', type: 'text', required: true },
            { name: 'hero', type: 'upload', relationTo: 'media' },
          ],
        },
      ],
      [revalidation({ dispatcher })],
    )
  })

  afterAll(async () => {
    await handle?.destroy()
    rmSync(mediaUploadDir, { recursive: true, force: true })
  })

  it('revalidates a post that references a media file when the file changes', async () => {
    const { payload } = handle
    const file = {
      data: Buffer.from('hello'),
      mimetype: 'text/plain',
      name: 'a.txt',
      size: 5,
    }
    const start = dispatches.length
    const media = await payload.create({ collection: 'media', data: { alt: 'one' }, file })
    await payload.create({ collection: 'posts', data: { slug: 'with-hero', hero: media.id } })
    await payload.create({ collection: 'posts', data: { slug: 'no-hero' } })

    // Let the create hook deliveries land before the media update.
    await waitFor(start, 'with-hero')
    await waitFor(start, 'no-hero')
    const from = dispatches.length
    await payload.update({ collection: 'media', id: media.id, data: { alt: 'two' } })
    await waitFor(from, 'with-hero')
    expect(dependentSlugs(from)).not.toContain('no-hero')
  })

  it('resolves all media dependents across the real Payload pagination boundary', async () => {
    const { payload } = handle
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'cursor test' },
      file: {
        data: Buffer.from('cursor'),
        mimetype: 'text/plain',
        name: 'cursor.txt',
        size: 6,
      },
    })
    const created = []
    for (let index = 0; index < 501; index += 1) {
      created.push(
        await payload.create({
          collection: 'posts',
          data: { slug: `pagination-${index}`, hero: media.id },
        }),
      )
    }

    const { changes, complete, failures } = await resolveMediaDependentChanges({
      mediaId: media.id,
      mediaSlug: 'media',
      payload,
      req: { payload } as never,
      locales: ['en'],
      operation: 'update',
    })

    expect(complete).toBe(true)
    expect(failures).toEqual([])
    expect(changes.map((change) => change.doc.id)).toEqual(created.map((doc) => doc.id))
    expect(new Set(changes.map((change) => change.doc.id)).size).toBe(501)
    expect(changes.map((change) => change.doc.slug)).toEqual(
      Array.from({ length: 501 }, (_, index) => `pagination-${index}`),
    )
  })
})
