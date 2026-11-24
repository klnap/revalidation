import { CacheConfigurationError } from '../../core/errors.js'
import type {
  BuiltPaths,
  BuiltTags,
  DefineRevalidationInputFull,
  DefineRevalidationInputLowEffort,
  HostLayerRule,
  LowEffortLayerFn,
  LowEffortLayerMap,
  PathTemplate,
  TagTemplate,
} from './host-types.js'
import { passthroughWireItemSchema } from './passthrough-wire-item-schema.js'

/** Internal: low-effort rules + wire handler apply to any CMS `envelope.source` label. */
const LOW_EFFORT_ANY_SOURCE = '*'

type LowEffortLayerFnRuntime = (
  tags: BuiltTags<Record<string, TagTemplate>>,
  paths?: BuiltPaths<Record<string, PathTemplate>>,
) => LowEffortLayerMap

const callLowEffortLayer = (
  fn: LowEffortLayerFn<Record<string, TagTemplate>, Record<string, PathTemplate> | undefined>,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
  hasPaths: boolean,
): LowEffortLayerMap => {
  const runtime = fn as LowEffortLayerFnRuntime
  return hasPaths ? runtime(builtTags, builtPaths) : runtime(builtTags)
}

const resolveLowEffortLayerMaps = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> | undefined,
>(
  input: DefineRevalidationInputLowEffort<TTags, TPaths>,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
  hasPaths: boolean,
) => {
  const invalidate = input.invalidate
  if (!invalidate) {
    throw new CacheConfigurationError('invalidate is required (cache key → tag rules)')
  }

  if (typeof invalidate === 'function') {
    return {
      next: callLowEffortLayer(
        invalidate as LowEffortLayerFn<
          Record<string, TagTemplate>,
          Record<string, PathTemplate> | undefined
        >,
        builtTags,
        builtPaths,
        hasPaths,
      ),
    }
  }

  const maps: Record<string, LowEffortLayerMap> = {}
  for (const [layerName, layerFn] of Object.entries(invalidate.layers)) {
    maps[layerName] = callLowEffortLayer(
      layerFn as LowEffortLayerFn<
        Record<string, TagTemplate>,
        Record<string, PathTemplate> | undefined
      >,
      builtTags,
      builtPaths,
      hasPaths,
    )
  }
  return maps
}

export const expandLowEffortHost = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> | undefined,
>(
  input: DefineRevalidationInputLowEffort<TTags, TPaths>,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
): DefineRevalidationInputFull<
  TTags,
  TPaths extends Record<string, PathTemplate> ? TPaths : Record<string, never>,
  string
> => {
  if (!input.resolve) {
    throw new CacheConfigurationError(
      'resolve is required — map wire items to invalidate cache keys',
    )
  }
  const hasPaths = Boolean(input.paths && Object.keys(input.paths).length > 0)

  const layerMaps = resolveLowEffortLayerMaps(
    input,
    builtTags as BuiltTags<Record<string, TagTemplate>>,
    builtPaths,
    hasPaths,
  )

  const layersByName: Record<string, HostLayerRule<string>[]> = {}

  for (const [layerName, cacheKeyRules] of Object.entries(layerMaps)) {
    const rules: HostLayerRule<string>[] = []
    for (const [cacheKey, spec] of Object.entries(cacheKeyRules)) {
      rules.push({
        key: { [LOW_EFFORT_ANY_SOURCE]: cacheKey },
        invalidates: spec,
      })
    }
    layersByName[layerName] = rules
  }

  if (!layersByName.next?.length) {
    throw new CacheConfigurationError(
      'invalidate: include at least one cache key rule (flat map or invalidate.layers.next)',
    )
  }

  const optionalParams = input.params

  return {
    secret: input.secret,
    mode: input.mode,
    tags: input.tags,
    paths: input.paths,
    sources: {
      [LOW_EFFORT_ANY_SOURCE]: {
        schema: passthroughWireItemSchema,
        resolve: input.resolve,
        ...(optionalParams ? { params: optionalParams } : undefined),
      },
    },
    layers: () => layersByName,
    execute: input.execute,
    logger: input.logger,
    maxBodyBytes: input.maxBodyBytes,
    maxEvents: input.maxEvents,
  }
}
