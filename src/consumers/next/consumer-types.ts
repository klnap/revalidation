import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CloudEvent } from '../../core/cloudevents.js'
import type { EventSelector, Operation, RevalidationResource } from '../../core/event-selector.js'
import type { Logger } from '../../core/types.js'
import {
  resourceChangedEventType,
  resourceChangedSchema,
} from '../../core/resource-changed-schema.js'
import type {
  BuiltPaths,
  BuiltTags,
  PathReference,
  PathTemplate,
  TagReference,
  TagTemplate,
} from './host-types.js'

const defaultSchemas = { [resourceChangedEventType]: resourceChangedSchema }

export type SchemaMap = Record<string, StandardSchemaV1>
type BuiltinSchemas = typeof defaultSchemas
export type EventSchemas<TSchemas extends SchemaMap> = BuiltinSchemas & TSchemas
export type SchemaOutput<TSchema> =
  TSchema extends StandardSchemaV1<unknown, infer TOutput> ? TOutput : never
export type EventOutput<TSchemas extends SchemaMap> = SchemaOutput<
  EventSchemas<TSchemas>[keyof EventSchemas<TSchemas>]
>
export type RevalidationExecutor<TData = unknown, TValue = unknown> = (
  context: RevalidationExecutionContext<TData, TValue>,
) => void | Promise<void>
export type ExecutorMap<TData> = Record<string, RevalidationExecutor<TData>>

export type RevalidationRuleContext<
  TData,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
> = {
  event: CloudEvent<TData>
  data: TData
  operation?: Operation
  resource?: RevalidationResource
  affected: readonly { operation: Operation; resource: RevalidationResource }[]
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
}

export type CacheProfile = string | { expire: number }
type TagAction = TagReference | string | readonly [TagReference | string, CacheProfile?]
type PathAction = PathReference | string | readonly [PathReference | string, 'page' | 'layout']

export type RevalidationRuleResult<TLayer extends string = string> = {
  tags?: readonly TagAction[]
  paths?: readonly PathAction[]
  profile?: CacheProfile
  operations?: readonly { layer: TLayer; value: unknown }[]
}

export type RevalidationExecutionContext<TData = unknown, TValue = unknown> = {
  event: CloudEvent<TData>
  data: TData
  operation?: Operation
  resource?: RevalidationResource
  affected: readonly { operation: Operation; resource: RevalidationResource }[]
  value: TValue
  signal: AbortSignal
}

type CanonicalAffectedData = {
  affected: readonly {
    operation: Operation
    resource: RevalidationResource
  }[]
}
type IsCanonicalData<T> = [T] extends [CanonicalAffectedData] ? T : never
type Resolver<
  TData,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> = (
  context: RevalidationRuleContext<TData, TTags, TPaths>,
) => RevalidationRuleResult<TLayer> | null | undefined
type TagReferenceFor<TTags extends Record<string, TagTemplate>> = TagReference<keyof TTags & string>
type PathReferenceFor<TPaths extends Record<string, PathTemplate>> = PathReference<
  keyof TPaths & string
>
type TemplateParamNames<T extends string> = T extends `${string}[${infer Key}]${infer Rest}`
  ? Key | TemplateParamNames<Rest>
  : never
type StaticPathKeys<TPaths extends Record<string, PathTemplate>> = {
  [K in keyof TPaths]: string extends TPaths[K]
    ? never
    : TemplateParamNames<TPaths[K]> extends never
      ? K
      : never
}[keyof TPaths]
type StaticPathReferenceFor<TPaths extends Record<string, PathTemplate>> = {
  [K in StaticPathKeys<TPaths> & string]: PathReference<K>
}[StaticPathKeys<TPaths> & string]
type DeclarativeTagFor<TTags extends Record<string, TagTemplate>> =
  | TagReferenceFor<TTags>
  | readonly [TagReferenceFor<TTags>, CacheProfile?]
type DeclarativePathFor<TPaths extends Record<string, PathTemplate>> =
  | PathReferenceFor<TPaths>
  | readonly [StaticPathReferenceFor<TPaths>, 'page' | 'layout']
type DeclarativeRule<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
> =
  | readonly DeclarativeTagFor<TTags>[]
  | {
      tags?: readonly DeclarativeTagFor<TTags>[]
      paths?: readonly DeclarativePathFor<TPaths>[]
      profile?: CacheProfile
    }

type InternalRule<
  TData,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> = object

type RulesOutput<
  TData,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> =
  | (IsCanonicalData<TData> extends never ? never : Record<string, DeclarativeRule<TTags, TPaths>>)
  | readonly InternalRule<TData, TTags, TPaths, TLayer>[]

export type RuleHelpers<
  TSchemas extends SchemaMap,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> = {
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
  on: {
    <TType extends keyof TSchemas & string>(
      selector: EventSelector & { type: TType },
      resolve: Resolver<SchemaOutput<TSchemas[TType]>, TTags, TPaths, TLayer>,
    ): InternalRule<EventOutput<TSchemas>, TTags, TPaths, TLayer>
    (
      selector: EventSelector,
      action: DeclarativeRule<TTags, TPaths>,
    ): InternalRule<EventOutput<TSchemas>, TTags, TPaths, TLayer>
    (
      selector: EventSelector,
      resolve: Resolver<EventOutput<TSchemas>, TTags, TPaths, TLayer>,
    ): InternalRule<EventOutput<TSchemas>, TTags, TPaths, TLayer>
    (
      resourceKeys: IsCanonicalData<EventOutput<TSchemas>> extends never
        ? never
        : string | readonly string[],
      action: DeclarativeRule<TTags, TPaths>,
    ): InternalRule<EventOutput<TSchemas>, TTags, TPaths, TLayer>
    (
      resourceKeys: IsCanonicalData<EventOutput<TSchemas>> extends never
        ? never
        : string | readonly string[],
      resolve: Resolver<EventOutput<TSchemas>, TTags, TPaths, TLayer>,
    ): InternalRule<EventOutput<TSchemas>, TTags, TPaths, TLayer>
  }
}

export type DefineRevalidationInput<
  TTags extends Record<string, TagTemplate> = Record<never, never>,
  TPaths extends Record<string, PathTemplate> = Record<never, never>,
  TSchemas extends SchemaMap = typeof defaultSchemas,
  TExecutors extends ExecutorMap<EventOutput<TSchemas>> = ExecutorMap<EventOutput<TSchemas>>,
> = {
  secret: string
  schemas?: TSchemas
  allowedSources?: readonly string[]
  tags?: TTags
  paths?: TPaths
  profile?: CacheProfile
  rules: (
    helpers: RuleHelpers<EventSchemas<TSchemas>, TTags, TPaths, keyof TExecutors & string>,
  ) => RulesOutput<EventOutput<TSchemas>, TTags, TPaths, keyof TExecutors & string>
  execute?: TExecutors
  maxBodyBytes?: number
  bodyTimeoutMs?: number
  maxEvents?: number
  maxOperations?: number
  executionTimeoutMs?: number
  logger?: Logger
}

export type DefinedRevalidation<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
> = {
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
  POST: (request: Request) => Promise<Response>
}
