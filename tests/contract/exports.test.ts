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
    'CLOUDEVENTS_BATCH_JSON',
    'CLOUDEVENTS_JSON',
    'CloudEventParseError',
    'aggregateDispatchOutcomes',
    'createDispatchError',
    'matchesEventSelector',
    'matchingAffectedResources',
    'parseCloudEvents',
    'validateStandardSchema',
  ],
  './sources/payload': ['payloadEventType', 'payloadSchema', 'payloadSource'],
  './producers/payload': [
    'RevalidationExcludeFieldsError',
    'normalizeExcludeFields',
    'readRevalidationExcludeFields',
    'resolveExcludeFields',
    'revalidation',
    'revalidationOrderableHooks',
  ],
  './consumers/next': ['defineRevalidation'],
  './dispatchers': ['http'],
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

  it('dispatchers barrel exposes only the current transport API', async () => {
    const mod = await import('@klnap/revalidation/dispatchers')
    expect(mod).toHaveProperty('http')
    expect(mod).not.toHaveProperty('normalizeTargets')
    expect(mod).not.toHaveProperty('resolveRevalidationTargets')
  })

  it('does not expose an unbound route handler or module registry', async () => {
    const mod = await import('@klnap/revalidation/consumers/next')
    expect(mod).not.toHaveProperty('POST')
    expect(mod).not.toHaveProperty('getDefinedRevalidation')
    expect(mod).not.toHaveProperty('resetDefinedRevalidation')
    expect(mod).not.toHaveProperty('createCache')
    expect(mod).not.toHaveProperty('createRevalidationHandler')
  })
})
