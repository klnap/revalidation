import type * as v from 'valibot'

import { CacheConfigurationError } from '../../core/errors.js'
import type { PayloadRevalidationItem } from '../../sources/payload/index.js'
import { payloadRevalidationItemSchema } from '../../sources/payload/index.js'
import { collectTemplateParamKeys } from './collect-template-param-keys.js'
import type {
  CompiledHostRuntime,
  CompiledHostSource,
  CompiledLayerRule,
} from './compiled-host-types.js'
import { defaultParamsFromEvent } from './default-params-from-event.js'
import { defaultPayloadParams } from './default-payload-params.js'
import type { NextRevalidationHandlerConfig } from './handler-config.js'
import {
  type BuiltPaths,
  type BuiltTags,
  type DefineRevalidationInput,
  type HostLayerRule,
  type HostLayersInput,
  type HostSourceDefinition,
  PATH_SYMBOL,
  type PathDef,
  type PathTemplate,
  type RevalidateObject,
  type RevalidateSpec,
  type RevalidationEvent,
  TAG_SYMBOL,
  type TagDef,
  type TagTemplate,
} from './host-types.js'
import { normalizeHostInput } from './normalize-host-input.js'
import { buildPathDefs, buildTagDefs } from './registry-builders.js'

export type {
  CompiledHostRuntime,
  CompiledLayerRule,
} from './compiled-host-types.js'

export type CompileHostResult = {
  config: NextRevalidationHandlerConfig
  runtime: CompiledHostRuntime
  tags: BuiltTags<Record<string, TagTemplate>>
  paths: BuiltPaths<Record<string, PathTemplate>>
}

const isPayloadSchema = (schema: v.GenericSchema): boolean =>
  schema === payloadRevalidationItemSchema

const tagIdFromDef = (tag: TagDef<string>): string => {
  const id = tag[TAG_SYMBOL]
  if (!id) {
    throw new CacheConfigurationError(
      'invalidates references a tag not from this defineRevalidation',
    )
  }
  return id
}

const pathIdFromDef = (path: PathDef<string>): string => {
  const id = path[PATH_SYMBOL]
  if (!id) {
    throw new CacheConfigurationError(
      'invalidates references a path not from this defineRevalidation',
    )
  }
  return id
}

type ParsedRevalidateSpec = {
  tagIds: string[]
  pathIds: string[]
  mode?: CompiledLayerRule['mode']
}

const parseRevalidateSpec = (
  spec: RevalidateSpec,
  layerName: string,
  index: number,
  tagIds: Set<string>,
  pathIds: Set<string>,
): ParsedRevalidateSpec => {
  if (Array.isArray(spec)) {
    if (!spec.length) {
      throw new CacheConfigurationError(
        `Layer "${layerName}" rule #${index}: invalidates must include at least one tag or path`,
      )
    }
    const compiledTagIds: string[] = []
    const tagList = spec as readonly TagDef<string>[]
    for (const tag of tagList) {
      const id = tagIdFromDef(tag)
      if (!tagIds.has(id)) {
        throw new CacheConfigurationError(
          `Layer "${layerName}" rule #${index}: unknown tag "${id}"`,
        )
      }
      compiledTagIds.push(id)
    }
    return { tagIds: compiledTagIds, pathIds: [] }
  }

  const object = spec as RevalidateObject
  const compiledTagIds: string[] = []
  const compiledPathIds: string[] = []

  for (const tag of object.tags ?? []) {
    const id = tagIdFromDef(tag)
    if (!tagIds.has(id)) {
      throw new CacheConfigurationError(`Layer "${layerName}" rule #${index}: unknown tag "${id}"`)
    }
    compiledTagIds.push(id)
  }

  for (const path of object.paths ?? []) {
    const id = pathIdFromDef(path)
    if (!pathIds.has(id)) {
      throw new CacheConfigurationError(`Layer "${layerName}" rule #${index}: unknown path "${id}"`)
    }
    compiledPathIds.push(id)
  }

  if (!compiledTagIds.length && !compiledPathIds.length) {
    throw new CacheConfigurationError(
      `Layer "${layerName}" rule #${index}: invalidates must include at least one tag or path`,
    )
  }

  return { tagIds: compiledTagIds, pathIds: compiledPathIds, mode: object.mode }
}

const validateRule = (
  rule: HostLayerRule,
  sourceNames: Set<string>,
  tagIds: Set<string>,
  pathIds: Set<string>,
  index: number,
  layerName: string,
): CompiledLayerRule => {
  for (const source of Object.keys(rule.key)) {
    if (!sourceNames.has(source)) {
      throw new CacheConfigurationError(
        `Layer "${layerName}" rule #${index}: key.${source} is not defined in sources`,
      )
    }
  }

  const parsed = parseRevalidateSpec(rule.invalidates, layerName, index, tagIds, pathIds)

  if (rule.prepare && typeof rule.prepare === 'object' && !('call' in rule.prepare)) {
    for (const source of Object.keys(rule.prepare)) {
      if (!(source in rule.key)) {
        throw new CacheConfigurationError(
          `Layer "${layerName}" rule #${index}: prepare.${source} without matching key.${source}`,
        )
      }
    }
  }

  const key: Record<string, string> = {}
  for (const [source, value] of Object.entries(rule.key)) {
    if (value !== undefined) key[source] = value
  }

  return {
    key,
    tagIds: parsed.tagIds,
    pathIds: parsed.pathIds,
    mode: rule.mode ?? parsed.mode,
    prepare: rule.prepare,
  }
}

export const compileHostRevalidation = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TSource extends string,
>(
  input: DefineRevalidationInput<TTags, TPaths, TSource>,
): CompileHostResult => {
  const full = normalizeHostInput(input)

  const builtTags = buildTagDefs(full.tags)
  const builtPaths = full.paths ? buildPathDefs(full.paths) : ({} as BuiltPaths<TPaths>)
  const templateParamKeys = collectTemplateParamKeys(
    builtTags as BuiltTags<Record<string, TagTemplate>>,
    builtPaths as BuiltPaths<Record<string, PathTemplate>>,
  )

  const tagIds = new Set(Object.keys(full.tags))
  const pathIds = new Set(full.paths ? Object.keys(full.paths) : [])
  const sourceNames = new Set(Object.keys(full.sources))

  const layersFn = full.layers as HostLayersInput<
    Record<string, TagTemplate>,
    Record<string, PathTemplate>,
    string
  >
  const layersInput = layersFn(
    builtTags as BuiltTags<Record<string, TagTemplate>>,
    builtPaths as BuiltPaths<Record<string, PathTemplate>>,
  )
  const rulesByLayer: Record<string, CompiledLayerRule[]> = {}

  for (const [layerName, rules] of Object.entries(layersInput)) {
    rulesByLayer[layerName] = rules.map((rule, index) =>
      validateRule(rule, sourceNames, tagIds, pathIds, index, layerName),
    )
  }

  const compiledSources: Record<string, CompiledHostSource> = {}
  for (const [name, source] of Object.entries(full.sources) as [string, HostSourceDefinition][]) {
    const paramsFn = source.params
      ? (event: RevalidationEvent) => ({
          ...defaultParamsFromEvent(event, templateParamKeys),
          ...(source.params?.(event) ?? {}),
        })
      : isPayloadSchema(source.schema)
        ? (event: RevalidationEvent) =>
            defaultPayloadParams(event as RevalidationEvent<PayloadRevalidationItem>)
        : (event: RevalidationEvent) => defaultParamsFromEvent(event, templateParamKeys)

    compiledSources[name] = {
      schema: source.schema,
      prepare: source.prepare,
      resolve: source.resolve,
      params: paramsFn,
    }
  }

  const runtime: CompiledHostRuntime = {
    sources: compiledSources,
    rulesByLayer,
    builtTags: builtTags as BuiltTags<Record<string, TagTemplate>>,
    builtPaths: builtPaths as BuiltPaths<Record<string, PathTemplate>>,
  }

  const config: NextRevalidationHandlerConfig = {
    secret: full.secret,
    mode: full.mode,
    sources: {},
    cache: { tags: {} },
    layers: {},
    execute: full.execute,
    logger: full.logger,
    maxBodyBytes: full.maxBodyBytes,
    maxEvents: full.maxEvents,
    host: runtime,
  }

  for (const [name, source] of Object.entries(compiledSources)) {
    config.sources[name] = {
      schema: source.schema,
      resolve: () => '',
    }
  }

  return {
    config,
    runtime,
    tags: builtTags as BuiltTags<Record<string, TagTemplate>>,
    paths: builtPaths as BuiltPaths<Record<string, PathTemplate>>,
  }
}
