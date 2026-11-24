import type * as v from 'valibot'

import type { CacheMode, LayerOperations, Logger } from '../../core/types.js'

export const TAG_SYMBOL: unique symbol = Symbol.for('@klnap/revalidation/tag')
export const PATH_SYMBOL: unique symbol = Symbol.for('@klnap/revalidation/path')

/** Params for `tags.*({ … })` and POST revalidation (any `[key]` in templates). */
export type TagParamsBag = Record<string, string | undefined>

export type RevalidationEnvelope = {
  source: string
  data: unknown
}

export type RevalidationEvent<TItem = unknown> = {
  source: string
  item: TItem
  raw: unknown
  index: number
  envelope: RevalidationEnvelope
  requestId: string
  key?: string
  locale?: string
  slug?: string
  documentId?: string
  collection?: string
  global?: string
  operation?: string
}

export type LayerRuleEvent<TItem = unknown> = RevalidationEvent<TItem> & {
  cacheKey: string
  layer: string
}

export type TagTemplate = string
export type PathTemplate = string

export type TagBuilder = (params: TagParamsBag) => string

type TemplateParamNames<T extends string> = T extends `${string}[${infer Key}]${infer Rest}`
  ? Key | TemplateParamNames<Rest>
  : never

type TemplateBuilder<T extends string> = string extends T
  ? TagBuilder
  : [TemplateParamNames<T>] extends [never]
    ? () => string
    : (params: { [K in TemplateParamNames<T>]: string }) => string

export type TagDef<
  TId extends string = string,
  TTemplate extends string = string,
> = TemplateBuilder<TTemplate> & {
  readonly [TAG_SYMBOL]: TId
}

export type PathDef<
  TId extends string = string,
  TTemplate extends string = string,
> = TemplateBuilder<TTemplate> & {
  readonly [PATH_SYMBOL]: TId
}

export type TagReference = { readonly [TAG_SYMBOL]: string }
export type PathReference = { readonly [PATH_SYMBOL]: string }

export type BuiltTags<T extends Record<string, TagTemplate> = Record<string, TagTemplate>> = {
  [K in keyof T]-?: TagDef<K & string, T[K]>
}

export type BuiltPaths<T extends Record<string, PathTemplate> = Record<string, PathTemplate>> = {
  [K in keyof T]-?: PathDef<K & string, T[K]>
}

export type RevalidateObject = {
  tags?: readonly TagReference[]
  paths?: readonly PathReference[]
  mode?: CacheMode
}

export type RevalidateSpec = readonly TagReference[] | RevalidateObject

export type LowEffortLayerMap = Record<string, RevalidateSpec>

export type LowEffortLayerFn<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> | undefined = undefined,
> = (
  tags: BuiltTags<TTags>,
  paths?: TPaths extends Record<string, PathTemplate> ? BuiltPaths<TPaths> : undefined,
) => LowEffortLayerMap

export type LowEffortLayersInput<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> | undefined = undefined,
> = {
  next: LowEffortLayerFn<TTags, TPaths>
} & {
  [layerName: string]: LowEffortLayerFn<TTags, TPaths>
}

export type HostSourceDefinition<TItem = unknown> = {
  schema: v.GenericSchema
  prepare?: (event: RevalidationEvent<TItem>) => Promise<TItem | void> | TItem | void
  resolve: (event: RevalidationEvent<TItem>) => string
  params?: (event: RevalidationEvent<TItem>) => TagParamsBag
}

export type LayerPrepareFn<TItem = unknown> = (
  event: LayerRuleEvent<TItem> | RevalidationEvent<TItem>,
) => Promise<Partial<TItem> | void> | Partial<TItem> | void

export type LayerPrepare<TItem = unknown> =
  | LayerPrepareFn<TItem>
  | Partial<Record<string, LayerPrepareFn<TItem>>>

export type HostLayerRule<TSource extends string = string> = {
  key: Partial<Record<TSource, string>>
  prepare?: LayerPrepare
  invalidates: RevalidateSpec
  mode?: CacheMode
}

export type HostLayersInput<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TSource extends string,
> = (
  tags: BuiltTags<TTags>,
  paths: BuiltPaths<TPaths>,
) => Record<string, readonly HostLayerRule<TSource>[]>

type DefineRevalidationShared<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
> = {
  secret: string
  mode?: CacheMode
  tags: TTags
  paths?: TPaths
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

export type DefineRevalidationInputFull<
  TTags extends Record<string, TagTemplate> = Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> = Record<string, PathTemplate>,
  TSource extends string = string,
> = DefineRevalidationShared<TTags, TPaths> & {
  sources: Record<TSource, HostSourceDefinition>
  layers: HostLayersInput<TTags, TPaths, TSource>
}

/** Flat cacheKey map → implied `next` layer, or explicit `layers` for next / CDN / custom. */
export type LowEffortInvalidateInput<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> | undefined = undefined,
> = LowEffortLayerFn<TTags, TPaths> | { layers: LowEffortLayersInput<TTags, TPaths> }

export type DefineRevalidationInputLowEffort<
  TTags extends Record<string, TagTemplate> = Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> | undefined = undefined,
> = DefineRevalidationShared<
  TTags,
  TPaths extends Record<string, PathTemplate> ? TPaths : Record<string, never>
> & {
  /**
   * Host maps flattened wire fields → cache keys in `invalidate` (required).
   * Unknown / empty keys are skipped on POST (logged, no app crash).
   */
  resolve: (event: RevalidationEvent) => string
  params?: (event: RevalidationEvent) => TagParamsBag
  invalidate: LowEffortInvalidateInput<TTags, TPaths>
}

export type DefineRevalidationInput<
  TTags extends Record<string, TagTemplate> = Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> = Record<string, PathTemplate>,
  TSource extends string = string,
> =
  | DefineRevalidationInputFull<TTags, TPaths, TSource>
  | DefineRevalidationInputLowEffort<TTags, TPaths | undefined>
