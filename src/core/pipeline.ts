import * as v from 'valibot'

import {
  CacheConfigurationError,
  CacheResolutionError,
  CacheSchemaError,
  CacheSourceError,
} from './errors.js'
import { dedupeEntries, normalizeItems, normalizeResolverOutput } from './normalize.js'
import type {
  CacheMode,
  CacheResolver,
  InspectResult,
  LayerInspectResult,
  LayerRule,
  Logger,
} from './types.js'

export type SourceDefinition = {
  schema: v.GenericSchema
  resolve: (data: unknown) => string
}

export type CacheDefinitions = {
  tags: Record<string, CacheResolver>
  paths: Record<string, CacheResolver>
}

export type PipelineConfig = {
  mode: CacheMode
  sources: Record<string, SourceDefinition>
  cache: CacheDefinitions
  layers: Record<string, Record<string, LayerRule>>
  logger?: Logger
}

const validateLayerRefs = (config: PipelineConfig): void => {
  for (const [layerName, rules] of Object.entries(config.layers)) {
    for (const [cacheKey, rule] of Object.entries(rules)) {
      for (const tagName of rule.tags ?? []) {
        if (!config.cache.tags[tagName]) {
          throw new CacheConfigurationError(
            `Layer "${layerName}" key "${cacheKey}" references unknown cache.tags.${tagName}`,
          )
        }
      }
      for (const pathName of rule.paths ?? []) {
        if (!config.cache.paths[pathName]) {
          throw new CacheConfigurationError(
            `Layer "${layerName}" key "${cacheKey}" references unknown cache.paths.${pathName}`,
          )
        }
      }
    }
  }
}

export const createPipeline = (config: PipelineConfig) => {
  validateLayerRefs(config)

  const parseSource = (source: string, rawItems: unknown[]): unknown[] => {
    const definition = Object.hasOwn(config.sources, source) ? config.sources[source] : undefined
    if (!definition) {
      throw new CacheSourceError(`Unknown source: ${source}`)
    }

    const items: unknown[] = []
    for (const raw of rawItems) {
      const parsed = v.safeParse(definition.schema, raw)
      if (!parsed.success) {
        throw new CacheSchemaError(`Schema validation failed for source "${source}"`)
      }
      items.push(parsed.output)
    }
    return items
  }

  const resolveOperations = (source: string, items: unknown[]): InspectResult => {
    const definition = Object.hasOwn(config.sources, source) ? config.sources[source] : undefined
    if (!definition) {
      throw new CacheSourceError(`Unknown source: ${source}`)
    }

    const cacheKeys: string[] = []
    const layers: LayerInspectResult = {}

    for (const layerName of Object.keys(config.layers)) {
      layers[layerName] = { tags: [], paths: [] }
    }

    for (const item of items) {
      const cacheKey = definition.resolve(item)
      if (!cacheKey) {
        throw new CacheResolutionError('resolve() returned empty cache key')
      }
      cacheKeys.push(cacheKey)

      for (const [layerName, rules] of Object.entries(config.layers)) {
        const rule = rules[cacheKey]
        if (!rule) continue

        const bucket = layers[layerName]
        if (!bucket) continue

        for (const tagName of rule.tags ?? []) {
          const resolver = config.cache.tags[tagName]
          if (!resolver) continue
          bucket.tags.push(...normalizeResolverOutput(resolver(item), config.mode))
        }
        for (const pathName of rule.paths ?? []) {
          const resolver = config.cache.paths[pathName]
          if (!resolver) continue
          bucket.paths.push(...normalizeResolverOutput(resolver(item), config.mode))
        }
      }
    }

    for (const layerName of Object.keys(layers)) {
      const bucket = layers[layerName]
      if (!bucket) continue
      bucket.tags = dedupeEntries(bucket.tags)
      bucket.paths = dedupeEntries(bucket.paths)
    }

    config.logger?.info?.(
      { source, cacheKeys, layerNames: Object.keys(layers) },
      'cache.operations.generated',
    )

    return { source, items, cacheKeys, layers }
  }

  const inspect = (input: { source: string; data: unknown }): InspectResult => {
    const items = parseSource(input.source, normalizeItems(input.data))
    return resolveOperations(input.source, items)
  }

  const inspectEnvelope = (envelope: { source: string; data: unknown }): InspectResult => {
    config.logger?.debug?.({ source: envelope.source }, 'cache.request.started')
    return inspect(envelope)
  }

  return { inspect, inspectEnvelope, parseSource, resolveOperations }
}
