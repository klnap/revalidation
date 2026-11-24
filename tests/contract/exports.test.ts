import { describe, expect, it } from 'bun:test'

const publicExports = {
  '.': ['createPipeline'],
  './sources/payload': ['payloadRevalidationItemSchema', 'payloadRevalidationSource'],
  './producers/payload': ['revalidation'],
  './consumers/next': ['createCache', 'defineRevalidation', 'POST'],
  './dispatchers': ['http'],
  './dispatchers/http': ['http'],
} as const

describe('package export subpaths', () => {
  for (const [subpath, names] of Object.entries(publicExports)) {
    it(`resolves ${subpath}`, async () => {
      const specifier =
        subpath === '.' ? '@klnap/revalidation' : `@klnap/revalidation${subpath.slice(1)}`
      const mod = await import(specifier)
      for (const name of names) expect(mod).toHaveProperty(name)
    })
  }

  it('dispatchers barrel exports http and not payloadJobs', async () => {
    const mod = await import('@klnap/revalidation/dispatchers')
    expect(mod).toHaveProperty('http')
    expect(mod).not.toHaveProperty('payloadJobs')
  })
})
