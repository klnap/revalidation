import {
  resourceChangedEventType,
  resourceChangedSchema,
} from '../../core/resource-changed-schema.js'
import type {
  DefineRevalidationInput,
  DefinedRevalidation,
  EventOutput,
  ExecutorMap,
  SchemaMap,
} from './consumer-types.js'
import type { PathTemplate, TagTemplate } from './host-types.js'
import { createRevalidationPostHandler } from './runtime.js'

export type {
  CacheProfile,
  DefineRevalidationInput,
  DefinedRevalidation,
  RevalidationExecutionContext,
  RevalidationExecutor,
  RevalidationRuleContext,
  RevalidationRuleResult,
} from './consumer-types.js'

const defaultSchemas = { [resourceChangedEventType]: resourceChangedSchema }

export const defineRevalidation = <
  const TTags extends Record<string, TagTemplate> = Record<never, never>,
  const TPaths extends Record<string, PathTemplate> = Record<never, never>,
  const TSchemas extends SchemaMap = typeof defaultSchemas,
  const TExecutors extends ExecutorMap<EventOutput<TSchemas>> = ExecutorMap<EventOutput<TSchemas>>,
>(
  input: DefineRevalidationInput<TTags, TPaths, TSchemas, TExecutors>,
): DefinedRevalidation<TTags, TPaths> => {
  if (!input.secret) throw new Error('defineRevalidation: secret is required')
  const schemas = { ...defaultSchemas, ...input.schemas }
  if (input.schemas && Object.hasOwn(input.schemas, resourceChangedEventType)) {
    throw new Error(`defineRevalidation: schema for ${resourceChangedEventType} is built in`)
  }
  for (const [type, schema] of Object.entries(schemas)) {
    if (!type || !schema || typeof schema['~standard']?.validate !== 'function') {
      throw new Error(
        'defineRevalidation: schemas must map event types to Standard Schema validators',
      )
    }
  }
  return createRevalidationPostHandler({ ...input, schemas })
}
