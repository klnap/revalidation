import type * as v from 'valibot'

import type { CacheMode } from '../../core/types.js'
import type {
  BuiltPaths,
  BuiltTags,
  HostSourceDefinition,
  LayerPrepare,
  PathTemplate,
  RevalidationEvent,
  TagParamsBag,
  TagTemplate,
} from './host-types.js'

export type CompiledHostSource = {
  schema: v.GenericSchema
  prepare?: HostSourceDefinition['prepare']
  resolve: HostSourceDefinition['resolve']
  params: (event: RevalidationEvent) => TagParamsBag
}

export type CompiledLayerRule = {
  key: Record<string, string>
  tagIds: readonly string[]
  pathIds: readonly string[]
  mode?: CacheMode
  prepare?: LayerPrepare
}

export type CompiledHostRuntime = {
  sources: Record<string, CompiledHostSource>
  rulesByLayer: Record<string, CompiledLayerRule[]>
  builtTags: BuiltTags<Record<string, TagTemplate>>
  builtPaths: BuiltPaths<Record<string, PathTemplate>>
}
