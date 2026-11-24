import type { CompiledLayerRule } from './compiled-host-types.js'

/** Matches per-source keys; `*` is a low-effort wildcard (any `envelope.source`). */
export const findMatchingRules = (
  source: string,
  cacheKey: string,
  rules: readonly CompiledLayerRule[],
): CompiledLayerRule[] =>
  rules.filter((rule) => {
    const bound = rule.key[source] ?? rule.key['*']
    return bound === cacheKey
  })
