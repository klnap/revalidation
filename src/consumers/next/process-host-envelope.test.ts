import { describe, expect, it } from 'bun:test'

import { inspectHostEnvelope } from './process-host-envelope.js'

describe('inspectHostEnvelope source lookup', () => {
  it('rejects an inherited object name instead of resolving it as a source', () => {
    const runtime = { sources: {}, layers: {}, cache: {} } as never
    for (const source of ['constructor', 'toString']) {
      expect(() =>
        inspectHostEnvelope(runtime, { source, data: [] } as never, 'expire', 10),
      ).toThrow(`Unknown source: ${source}`)
    }
  })
})
