import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DispatchInput } from '../../src/core/index.js'
import { revalidation } from '../../src/producers/payload/plugin.js'
import { createTestPayload, type TestPayloadHandle } from './helpers/test-payload.js'

const dispatches: DispatchInput[] = []
const dispatcher = {
  async dispatch(input: DispatchInput) {
    dispatches.push(input)
    return { status: 'accepted' as const }
  },
}
let handle!: TestPayloadHandle

const dependentSlugs = (from: number) =>
  dispatches
    .slice(from)
    .flatMap((d) => d.events)
    .flatMap((e) => e.data as Array<Record<string, unknown>>)
    .map((item) => item.slug)

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
    handle = await createTestPayload(
      [
        {
          slug: 'media',
          upload: { staticDir: mkdtempSync(join(tmpdir(), 'revalidation-media-')) },
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

    // Create events are dispatched after commit; let them land before the media update.
    await waitFor(start, 'with-hero')
    await waitFor(start, 'no-hero')
    const from = dispatches.length
    await payload.update({ collection: 'media', id: media.id, data: { alt: 'two' } })
    await waitFor(from, 'with-hero')
    expect(dependentSlugs(from)).not.toContain('no-hero')
  })
})
