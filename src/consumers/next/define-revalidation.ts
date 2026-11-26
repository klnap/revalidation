import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CloudEvent } from '../../core/cloudevents.js'
import type { EventSelector } from '../../core/event-selector.js'
import type { Logger } from '../../core/types.js'
import type { BuiltPaths, BuiltTags, PathTemplate, TagTemplate } from './host-types.js'
import { createRevalidationPostHandler } from './runtime.js'

export type RevalidationRuleContext<
  TData,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
> = {
  event: CloudEvent<TData>
  data: TData
  operation?: 'create' | 'update' | 'delete'
  resource?: { type: string; name?: string; id?: string; locale?: string; slug?: string }
  affected: readonly {
    operation: 'create' | 'update' | 'delete'
    resource: { type: string; name?: string; id?: string; locale?: string; slug?: string }
  }[]
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
}

export type RevalidationRuleResult<TLayer extends string = string> = {
  tags?: readonly (
    | string
    | { value: string; mode?: 'expire' | 'stale' | string | { expire?: number } }
  )[]
  paths?: readonly (string | { value: string; type?: 'page' | 'layout' })[]
  mode?: 'expire' | 'stale' | string | { expire?: number }
  operations?: readonly { layer: TLayer; value: unknown }[]
}

export type RevalidationExecutionContext<TData = unknown, TValue = unknown> = Omit<
  RevalidationRuleContext<TData, Record<never, never>, Record<never, never>>,
  'tags' | 'paths'
> & { value: TValue; signal: AbortSignal }

export type RevalidationExecutor<TData = unknown, TValue = unknown> = (
  context: RevalidationExecutionContext<TData, TValue>,
) => void | Promise<void>

type SchemaOutput<TSchema> =
  TSchema extends StandardSchemaV1<unknown, infer TOutput> ? TOutput : never
type SourceOutput<TSources extends SchemaMap> = SchemaOutput<TSources[keyof TSources]>
type ExecutorMap<TData> = Record<string, RevalidationExecutor<TData>>
type Resolver<
  TData,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> = (
  context: RevalidationRuleContext<TData, TTags, TPaths>,
) => RevalidationRuleResult<TLayer> | null | undefined

type SchemaMap = Record<string, StandardSchemaV1>
type Rule<
  TSources extends SchemaMap,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> = { selector: EventSelector; resolve: Resolver<SourceOutput<TSources>, TTags, TPaths, TLayer> }
type RuleMapping<
  TSources extends SchemaMap,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> = Record<string, Record<string, Resolver<SourceOutput<TSources>, TTags, TPaths, TLayer>>>
type RulesOutput<
  TSources extends SchemaMap,
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TLayer extends string,
> =
  | RuleMapping<TSources, TTags, TPaths, TLayer>
  | readonly (
      | Rule<TSources, TTags, TPaths, TLayer>
      | RuleMapping<TSources, TTags, TPaths, TLayer>
    )[]

export type DefineRevalidationInput<
  TTags extends Record<string, TagTemplate> = Record<never, never>,
  TPaths extends Record<string, PathTemplate> = Record<never, never>,
  TSources extends SchemaMap = SchemaMap,
  TExecutors extends ExecutorMap<SourceOutput<TSources>> = ExecutorMap<SourceOutput<TSources>>,
> = {
  secret: string
  sources: TSources
  tags?: TTags
  paths?: TPaths
  mode?: 'expire' | 'stale'
  rules: (helpers: {
    tags: BuiltTags<TTags>
    paths: BuiltPaths<TPaths>
    on: {
      <TSource extends keyof TSources & string>(
        selector: EventSelector & { source: TSource },
        resolve: Resolver<
          SchemaOutput<TSources[TSource]>,
          TTags,
          TPaths,
          keyof TExecutors & string
        >,
      ): Rule<TSources, TTags, TPaths, keyof TExecutors & string>
      (
        selector: EventSelector,
        resolve: Resolver<SourceOutput<TSources>, TTags, TPaths, keyof TExecutors & string>,
      ): Rule<TSources, TTags, TPaths, keyof TExecutors & string>
    }
  }) => RulesOutput<TSources, TTags, TPaths, keyof TExecutors & string>
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

export const defineRevalidation = <
  const TTags extends Record<string, TagTemplate> = Record<never, never>,
  const TPaths extends Record<string, PathTemplate> = Record<never, never>,
  const TSources extends SchemaMap = SchemaMap,
  const TExecutors extends ExecutorMap<SourceOutput<TSources>> = ExecutorMap<
    SourceOutput<TSources>
  >,
>(
  input: DefineRevalidationInput<TTags, TPaths, TSources, TExecutors>,
): DefinedRevalidation<TTags, TPaths> => {
  if (!input.secret) throw new Error('defineRevalidation: secret is required')
  if (!Object.keys(input.sources).length)
    throw new Error('defineRevalidation: sources are required')
  const result = createRevalidationPostHandler(input as never)
  return result as DefinedRevalidation<TTags, TPaths>
}
