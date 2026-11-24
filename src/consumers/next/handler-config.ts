import type { SourceDefinition } from '../../core/pipeline.js'
import type { CacheMode, CacheResolver, LayerOperations, Logger } from '../../core/types.js'
import type { CompiledHostRuntime } from './compiled-host-types.js'

export type NextRevalidationHandlerConfig = {
  secret: string
  mode?: CacheMode
  sources: Record<string, SourceDefinition>
  cache: {
    tags: Record<string, CacheResolver>
    paths?: Record<string, CacheResolver>
  }
  layers: Record<string, Record<string, { tags?: readonly string[]; paths?: readonly string[] }>>
  /** Set by `defineRevalidation` host compiler — async rule matching and tag resolution. */
  host?: CompiledHostRuntime
  execute?: Record<
    string,
    (
      payload: LayerOperations & { requestId: string; source: string; cacheKeys: string[] },
    ) => Promise<void>
  >
  logger?: Logger
  maxBodyBytes?: number
  maxEvents?: number
}
