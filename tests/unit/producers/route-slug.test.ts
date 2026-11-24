import { describe, expect, it, mock } from 'bun:test'

import { readCollectionRouteSlug } from '../../../src/producers/payload/lifecycle/revalidate'
import type { RevalidateArgs } from '../../../src/producers/payload/lifecycle/types'

/** Collection hook args whose document carries `slug`; the logger records warnings. */
const argsFor = (slug: unknown) => {
  const warn = mock((_message: string) => undefined)
  const args = {
    operation: 'update',
    collection: { slug: 'pages', custom: undefined },
    doc: { id: 'doc-1', slug },
    req: { payload: { logger: { warn, info: () => undefined } } },
  } as unknown as RevalidateArgs
  return { args, warn }
}

describe('readCollectionRouteSlug', () => {
  it('passes an ordinary slug through without a warning', () => {
    const { args, warn } = argsFor('tower-1')
    expect(readCollectionRouteSlug(args, 'en', args.doc as Record<string, unknown>)).toBe('tower-1')
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['.', '..', 'a/b', 'a\\b', 'a\nb'])('omits the slug %j and logs a warning', (slug) => {
    const { args, warn } = argsFor(slug)
    expect(readCollectionRouteSlug(args, 'en', args.doc as Record<string, unknown>)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('[revalidate] warn')
    expect(warn.mock.calls[0]?.[0]).toContain('slug omitted')
  })

  it('omits a slug longer than 256 characters', () => {
    const { args, warn } = argsFor('x'.repeat(257))
    expect(readCollectionRouteSlug(args, 'en', args.doc as Record<string, unknown>)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
