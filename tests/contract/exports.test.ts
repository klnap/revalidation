import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'

const publicExports = {
  '.': [
    'CacheConfigurationError',
    'CacheExecutionError',
    'CacheRequestError',
    'CacheResolutionError',
    'CacheSchemaError',
    'CacheSourceError',
    'InvalidKeyError',
    'aggregateDispatchOutcomes',
    'createDispatchError',
    'createPipeline',
    'normalizeTargets',
    'toHttpStatus',
  ],
  './sources/payload': ['payloadRevalidationItemSchema', 'payloadRevalidationSource'],
  './producers/payload': [
    'RevalidationExcludeFieldsError',
    'normalizeExcludeFields',
    'readRevalidationExcludeFields',
    'resolveExcludeFields',
    'revalidation',
    'revalidationOrderableHooks',
  ],
  './consumers/next': [
    'InvalidKeyError',
    'createCache',
    'createRevalidationHandler',
    'defineRevalidation',
    'invalidKey',
  ],
  './dispatchers': ['http', 'normalizeTargets', 'resolveRevalidationTargets'],
  './dispatchers/http': ['http'],
} as const

describe('package export subpaths', () => {
  it('keeps the public package paths explicit', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, unknown> }
    expect(Object.keys(manifest.exports).sort()).toEqual(Object.keys(publicExports).sort())
  })

  for (const [subpath, names] of Object.entries(publicExports)) {
    it(`resolves ${subpath}`, async () => {
      const specifier =
        subpath === '.' ? '@klnap/revalidation' : `@klnap/revalidation${subpath.slice(1)}`
      const mod = await import(specifier)
      expect(Object.keys(mod).sort()).toEqual([...names].sort())
    })
  }

  it('dispatchers barrel exports http and not payloadJobs', async () => {
    const mod = await import('@klnap/revalidation/dispatchers')
    expect(mod).toHaveProperty('http')
    expect(mod).not.toHaveProperty('payloadJobs')
  })

  it('does not expose an unbound route handler or module registry', async () => {
    const mod = await import('@klnap/revalidation/consumers/next')
    expect(mod).not.toHaveProperty('POST')
    expect(mod).not.toHaveProperty('getDefinedRevalidation')
    expect(mod).not.toHaveProperty('resetDefinedRevalidation')
  })
})
