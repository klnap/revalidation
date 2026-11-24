import * as v from 'valibot'

import { CacheSourceError, InvalidKeyError } from '../../core/errors.js'
import { dedupeEntries, normalizeItems } from '../../core/normalize.js'
import type { InspectResult, LayerInspectResult, Logger } from '../../core/types.js'
import type { CompiledHostRuntime } from './compiled-host-types.js'
import { flattenRevalidationEvent } from './flatten-revalidation-event.js'
import {
  collectPathsForRule,
  collectTagsForRule,
  mergeItem,
  runRulePrepare,
} from './host-rule-runtime.js'
import type { RevalidationEnvelope } from './host-types.js'
import { findMatchingRules } from './match-layer-rules.js'

type WireSkipReason = 'schema' | 'empty_cache_key' | 'no_rule' | 'missing_param'

const logWireSkip = (
  logger: Logger | undefined,
  requestId: string,
  reason: WireSkipReason,
  detail: Record<string, unknown>,
): void => {
  logger?.warn?.({ requestId, reason, ...detail }, 'cache.revalidate.item.skipped')
}

export const processHostEnvelope = async (
  runtime: CompiledHostRuntime,
  envelope: RevalidationEnvelope,
  requestId: string,
  defaultMode: 'expire' | 'stale',
  maxEvents: number,
  logger?: Logger,
): Promise<InspectResult> => {
  // Own keys only: an inherited name such as 'constructor' must not resolve to a source.
  const sourceDef =
    (Object.hasOwn(runtime.sources, envelope.source)
      ? runtime.sources[envelope.source]
      : undefined) ?? runtime.sources['*']
  if (!sourceDef) {
    throw new CacheSourceError(`Unknown source: ${envelope.source}`)
  }

  const normalized = normalizeItems(envelope.data)
  if (normalized.length > maxEvents) {
    throw new CacheSourceError(`Too many events (max ${maxEvents})`)
  }

  const cacheKeys: string[] = []
  const layers: LayerInspectResult = {}
  for (const layerName of Object.keys(runtime.rulesByLayer)) {
    layers[layerName] = { tags: [], paths: [] }
  }

  for (let index = 0; index < normalized.length; index++) {
    const raw = normalized[index]
    const parsed = v.safeParse(sourceDef.schema, raw)
    if (!parsed.success) {
      logWireSkip(logger, requestId, 'schema', { source: envelope.source, index })
      continue
    }

    let item = parsed.output as Record<string, unknown>
    const baseEvent = flattenRevalidationEvent(
      {
        source: envelope.source,
        item,
        raw,
        index,
        envelope,
        requestId,
      },
      item,
    )

    if (sourceDef.prepare) {
      const prepared = await sourceDef.prepare(baseEvent)
      item = mergeItem(item, prepared as Record<string, unknown>)
    }

    const event = flattenRevalidationEvent({ ...baseEvent, item }, item)
    let cacheKey: string
    try {
      cacheKey = sourceDef.resolve(event)
    } catch (error) {
      if (error instanceof InvalidKeyError) {
        logWireSkip(logger, requestId, 'empty_cache_key', { source: envelope.source, index })
        continue
      }
      throw error
    }
    if (!cacheKey) {
      logWireSkip(logger, requestId, 'empty_cache_key', { source: envelope.source, index })
      continue
    }

    let matchedAny = false

    for (const [layerName, rules] of Object.entries(runtime.rulesByLayer)) {
      const matched = findMatchingRules(envelope.source, cacheKey, rules)
      if (!matched.length) continue

      matchedAny = true
      const bucket = layers[layerName]
      if (!bucket) continue

      for (const rule of matched) {
        const layerEvent = await runRulePrepare(rule.prepare, envelope.source, {
          ...event,
          cacheKey,
          layer: layerName,
        })
        const params = sourceDef.params(layerEvent)
        const onSkip = (id: string) =>
          logWireSkip(logger, requestId, 'missing_param', { source: envelope.source, index, id })
        bucket.tags.push(
          ...collectTagsForRule(rule, runtime.builtTags, params, defaultMode, onSkip),
        )
        bucket.paths.push(
          ...collectPathsForRule(rule, runtime.builtPaths, params, defaultMode, onSkip),
        )
      }
    }

    if (!matchedAny) {
      logWireSkip(logger, requestId, 'no_rule', {
        source: envelope.source,
        index,
        cacheKey,
      })
      continue
    }

    cacheKeys.push(cacheKey)
  }

  for (const layerName of Object.keys(layers)) {
    const bucket = layers[layerName]
    if (!bucket) continue
    bucket.tags = dedupeEntries(bucket.tags)
    bucket.paths = dedupeEntries(bucket.paths)
  }

  return {
    source: envelope.source,
    items: normalized,
    cacheKeys,
    layers,
  }
}

/** Sync inspect — skips prepare hooks. */
export const inspectHostEnvelope = (
  runtime: CompiledHostRuntime,
  envelope: RevalidationEnvelope,
  defaultMode: 'expire' | 'stale',
  maxEvents: number,
  logger?: Logger,
): InspectResult => {
  // Own keys only: an inherited name such as 'constructor' must not resolve to a source.
  const sourceDef =
    (Object.hasOwn(runtime.sources, envelope.source)
      ? runtime.sources[envelope.source]
      : undefined) ?? runtime.sources['*']
  if (!sourceDef) {
    throw new CacheSourceError(`Unknown source: ${envelope.source}`)
  }

  const normalized = normalizeItems(envelope.data)
  if (normalized.length > maxEvents) {
    throw new CacheSourceError(`Too many events (max ${maxEvents})`)
  }

  const cacheKeys: string[] = []
  const layers: LayerInspectResult = {}
  for (const layerName of Object.keys(runtime.rulesByLayer)) {
    layers[layerName] = { tags: [], paths: [] }
  }

  for (let index = 0; index < normalized.length; index++) {
    const raw = normalized[index]
    const parsed = v.safeParse(sourceDef.schema, raw)
    if (!parsed.success) {
      logWireSkip(logger, 'inspect', 'schema', { source: envelope.source, index })
      continue
    }

    const item = parsed.output as Record<string, unknown>
    const event = flattenRevalidationEvent(
      {
        source: envelope.source,
        item,
        raw,
        index,
        envelope,
        requestId: 'inspect',
      },
      item,
    )

    let cacheKey: string
    try {
      cacheKey = sourceDef.resolve(event)
    } catch (error) {
      if (error instanceof InvalidKeyError) {
        logWireSkip(logger, 'inspect', 'empty_cache_key', { source: envelope.source, index })
        continue
      }
      throw error
    }
    if (!cacheKey) {
      logWireSkip(logger, 'inspect', 'empty_cache_key', { source: envelope.source, index })
      continue
    }

    let matchedAny = false

    for (const [layerName, rules] of Object.entries(runtime.rulesByLayer)) {
      const matched = findMatchingRules(envelope.source, cacheKey, rules)
      if (!matched.length) continue

      matchedAny = true
      const bucket = layers[layerName]
      if (!bucket) continue

      for (const rule of matched) {
        const params = sourceDef.params(event)
        const onSkip = (id: string) =>
          logWireSkip(logger, 'inspect', 'missing_param', { source: envelope.source, index, id })
        bucket.tags.push(
          ...collectTagsForRule(rule, runtime.builtTags, params, defaultMode, onSkip),
        )
        bucket.paths.push(
          ...collectPathsForRule(rule, runtime.builtPaths, params, defaultMode, onSkip),
        )
      }
    }

    if (!matchedAny) {
      logWireSkip(logger, 'inspect', 'no_rule', {
        source: envelope.source,
        index,
        cacheKey,
      })
      continue
    }

    cacheKeys.push(cacheKey)
  }

  for (const layerName of Object.keys(layers)) {
    const bucket = layers[layerName]
    if (!bucket) continue
    bucket.tags = dedupeEntries(bucket.tags)
    bucket.paths = dedupeEntries(bucket.paths)
  }

  return {
    source: envelope.source,
    items: normalized,
    cacheKeys,
    layers,
  }
}
