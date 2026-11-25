import { CacheConfigurationError } from '../../core/errors.js'
import type {
  BuiltPaths,
  BuiltTags,
  DefineRevalidationInputFull,
  DefineRevalidationInputRules,
  HostLayerRule,
  PathTemplate,
  RuleMap,
  RulesInput,
  TagTemplate,
} from './host-types.js'
import { passthroughWireItemSchema } from './passthrough-wire-item-schema.js'

/** Internal: simple rules + wire handler apply to any CMS `envelope.source` label. */
const LOW_EFFORT_ANY_SOURCE = '*'

type RuleMapFnRuntime = (context: {
  tags: BuiltTags<Record<string, TagTemplate>>
  paths: BuiltPaths<Record<string, PathTemplate>>
}) => RuleMap

const callRuleMap = (
  fn: RuleMapFnRuntime,
  tags: BuiltTags<Record<string, TagTemplate>>,
  paths: BuiltPaths<Record<string, PathTemplate>>,
): RuleMap => fn({ tags, paths })

const resolveRuleMaps = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
>(
  input: DefineRevalidationInputRules<TTags, TPaths>,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
): Record<string, RuleMap> => {
  const rules = input.rules as RulesInput<Record<string, TagTemplate>, Record<string, PathTemplate>>
  if (typeof rules === 'function') {
    return { next: callRuleMap(rules, builtTags, builtPaths) }
  }

  const maps: Record<string, RuleMap> = {}
  for (const [layerName, layerFn] of Object.entries(rules.layers)) {
    maps[layerName] = callRuleMap(layerFn, builtTags, builtPaths)
  }
  return maps
}

export const expandLowEffortHost = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
>(
  input: DefineRevalidationInputRules<TTags, TPaths>,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
): DefineRevalidationInputFull<TTags, TPaths, string> => {
  if (!input.resolve) {
    throw new CacheConfigurationError(
      'resolve is required — map producer events to application rule keys',
    )
  }

  const layerMaps = resolveRuleMaps(input, builtTags, builtPaths)
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
      'rules: include at least one resolved-key rule (flat map or rules.layers.next)',
    )
  }

  return {
    secret: input.secret,
    mode: input.mode,
    tags: input.tags ?? ({} as TTags),
    paths: input.paths ?? ({} as TPaths),
    sources: {
      [LOW_EFFORT_ANY_SOURCE]: {
        schema: passthroughWireItemSchema,
        resolve: input.resolve,
        ...(input.params ? { params: input.params } : undefined),
      },
    },
    layers: () => layersByName,
    execute: input.execute,
    logger: input.logger,
    maxBodyBytes: input.maxBodyBytes,
    maxEvents: input.maxEvents,
  }
}
