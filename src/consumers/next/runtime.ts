import type { StandardSchemaV1 } from '@standard-schema/spec'
import { Webhook } from 'standardwebhooks'
import {
  CLOUDEVENTS_BATCH_JSON,
  CLOUDEVENTS_JSON,
  CacheConfigurationError,
  CacheRequestError,
  CacheSchemaError,
  CacheSourceError,
  CloudEventParseError,
  matchesEventSelector,
  parseCloudEvents,
  validateStandardSchema,
  type CloudEvent,
  type EventSelector,
  type Logger,
  type Operation,
  type RevalidationResource,
} from '../../core/index.js'
import {
  assertLimit,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_EVENT_ITEMS,
  MAX_BODY_BYTES_CEILING,
  MAX_EVENT_ITEMS_CEILING,
} from '../../core/event-limits.js'
import { buildPathDefs, buildTagDefs } from './registry-builders.js'
import type { PathTemplate, TagTemplate } from './host-types.js'
import { revalidatePath, revalidateTag } from 'next/cache.js'

type CacheProfile = string | { expire?: number }
type TagResult = string | { value: string; mode?: 'expire' | 'stale' | CacheProfile }
type PathResult = string | { value: string; type?: 'page' | 'layout' }
type RuleResult = {
  tags?: readonly TagResult[]
  paths?: readonly PathResult[]
  mode?: 'expire' | 'stale' | CacheProfile
  operations?: readonly { layer: string; value: unknown }[]
}
type RuleContext<TData = unknown> = {
  event: CloudEvent<TData>
  data: TData
  operation?: Operation
  resource?: RevalidationResource
  affected: readonly { operation: Operation; resource: RevalidationResource }[]
  tags: Record<string, (...args: never[]) => string>
  paths: Record<string, (...args: never[]) => string>
}
type Resolver = (context: RuleContext) => RuleResult | null | undefined
type CompiledRule = { selector: EventSelector; resolve: Resolver }
type SchemaMap = Record<string, StandardSchemaV1>
const DEFAULT_BODY_TIMEOUT_MS = 15_000
const MAX_BODY_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OPERATIONS = 1000
const MAX_OPERATIONS_CEILING = 10_000
const DEFAULT_EXECUTION_TIMEOUT_MS = 15_000
const MAX_EXECUTION_TIMEOUT_MS = 60_000
type CustomOperation = { layer: string; value: unknown }
type CacheOperation =
  | { kind: 'tag'; value: string; profile: CacheProfile }
  | { kind: 'path'; value: string; type?: 'page' | 'layout' }
type RulePlan = {
  context: RuleContext
  custom: readonly CustomOperation[]
  cache: readonly CacheOperation[]
}
type ExecutionResult = {
  layer: string
  operation: string
  status: 'success' | 'failed' | 'skipped'
  error?: { code: string; message: string }
}

export type NextRuntimeConfig = {
  secret: string
  sources: SchemaMap
  tags?: Record<string, TagTemplate>
  paths?: Record<string, PathTemplate>
  mode?: 'expire' | 'stale'
  rules: (helpers: {
    tags: ReturnType<typeof buildTagDefs>
    paths: ReturnType<typeof buildPathDefs>
    on: (selector: EventSelector, resolve: Resolver) => CompiledRule
  }) =>
    | Record<string, Record<string, Resolver>>
    | readonly (CompiledRule | Record<string, Record<string, Resolver>>)[]
  execute?: Record<
    string,
    (context: RuleContext & { value: unknown; signal: AbortSignal }) => void | Promise<void>
  >
  maxBodyBytes?: number
  bodyTimeoutMs?: number
  maxEvents?: number
  maxOperations?: number
  executionTimeoutMs?: number
  logger?: Logger
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asList = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value as T]

const isCompiledRule = (value: unknown): value is CompiledRule =>
  isRecord(value) && isRecord(value.selector) && typeof value.resolve === 'function'

const compileMapping = (
  mapping: Record<string, Record<string, Resolver>>,
  on: (selector: EventSelector, resolve: Resolver) => CompiledRule,
): CompiledRule[] => {
  const compiled: CompiledRule[] = []
  for (const [type, byName] of Object.entries(mapping)) {
    if (!isRecord(byName)) continue
    for (const [name, resolver] of Object.entries(byName)) {
      if (typeof resolver !== 'function') continue
      compiled.push(on({ affected: { type, name } }, resolver as Resolver))
    }
  }
  return compiled
}

const compileRules = (
  rules: ReturnType<NextRuntimeConfig['rules']>,
  on: (selector: EventSelector, resolve: Resolver) => CompiledRule,
): CompiledRule[] => {
  if (!Array.isArray(rules))
    return compileMapping(rules as Record<string, Record<string, Resolver>>, on)
  return rules.flatMap((rule) =>
    isCompiledRule(rule)
      ? [rule]
      : isRecord(rule)
        ? compileMapping(rule as Record<string, Record<string, Resolver>>, on)
        : [],
  )
}

const getAffected = (
  event: CloudEvent,
): { operation: Operation; resource: RevalidationResource }[] => {
  if (!isRecord(event.data) || !Array.isArray(event.data.affected)) return []
  return event.data.affected.filter(
    (item): item is { operation: Operation; resource: RevalidationResource } =>
      isRecord(item) &&
      ['create', 'update', 'delete'].includes(String(item.operation)) &&
      isRecord(item.resource) &&
      typeof item.resource.type === 'string',
  )
}

const parseTagProfile = (
  mode: 'expire' | 'stale' | CacheProfile | undefined,
  defaultMode: 'expire' | 'stale',
): CacheProfile => {
  if (mode === 'expire') return { expire: 0 }
  if (mode === 'stale') return 'max'
  return mode ?? (defaultMode === 'expire' ? { expire: 0 } : 'max')
}

const readRawBody = async (
  request: Request,
  maxBytes: number,
  timeoutMs: number,
): Promise<Uint8Array> => {
  const declared = request.headers.get('content-length')
  if (declared && Number(declared) > maxBytes) throw new CacheSourceError('Request body too large')
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timeoutHandle: ReturnType<typeof setTimeout>
  let rejectTimeout: (error: Error) => void = () => {}
  let timedOut = false
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject
    timeoutHandle = setTimeout(() => {
      timedOut = true
      rejectTimeout(new CacheSourceError('Request body timed out'))
      void reader.cancel().catch(() => undefined)
    }, timeoutMs)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined)
        throw new CacheSourceError('Request body too large')
      }
      chunks.push(value)
    }
  } finally {
    clearTimeout(timeoutHandle!)
    if (!timedOut) reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

const verifyWebhook = (request: Request, body: Uint8Array, secret: string): string => {
  const id = request.headers.get('webhook-id') ?? ''
  const timestamp = request.headers.get('webhook-timestamp') ?? ''
  const signature = request.headers.get('webhook-signature') ?? ''
  if (
    !id ||
    !/^\d+$/.test(timestamp) ||
    !/^v1,[A-Za-z0-9+/]+={0,2}(?: v1,[A-Za-z0-9+/]+={0,2})*$/.test(signature)
  ) {
    throw new CacheRequestError('Invalid webhook headers')
  }
  try {
    new Webhook(secret).verify(
      body,
      {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      { jsonParse: false },
    )
  } catch {
    throw new CacheRequestError('Invalid webhook signature or timestamp')
  }
  return id
}

const response = (status: number, body: unknown, requestId?: string): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(requestId ? { 'X-Cache-Request-Id': requestId } : {}),
    },
  })

export const createRevalidationPostHandler = (config: NextRuntimeConfig) => {
  const maxBodyBytes = assertLimit(
    'maxBodyBytes',
    config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    MAX_BODY_BYTES_CEILING,
  )
  const bodyTimeoutMs = assertLimit(
    'bodyTimeoutMs',
    config.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS,
    MAX_BODY_TIMEOUT_MS,
  )
  const maxOperations = assertLimit(
    'maxOperations',
    config.maxOperations ?? DEFAULT_MAX_OPERATIONS,
    MAX_OPERATIONS_CEILING,
  )
  const executionTimeoutMs = assertLimit(
    'executionTimeoutMs',
    config.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
    MAX_EXECUTION_TIMEOUT_MS,
  )
  const maxEvents = assertLimit(
    'maxEvents',
    config.maxEvents ?? DEFAULT_MAX_EVENT_ITEMS,
    MAX_EVENT_ITEMS_CEILING,
  )
  const tags = buildTagDefs(config.tags ?? {})
  const paths = buildPathDefs(config.paths ?? {})
  const on = (selector: EventSelector, resolve: Resolver): CompiledRule => ({ selector, resolve })
  const compiledRules = compileRules(config.rules({ tags, paths, on }), on)
  const defaultMode = config.mode ?? 'expire'

  const POST = async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    if (request.method !== 'POST') return response(405, { error: 'Method not allowed' }, requestId)
    const contentType = request.headers.get('content-type') ?? ''
    if (
      ![CLOUDEVENTS_JSON, CLOUDEVENTS_BATCH_JSON].includes(
        contentType.split(';', 1)[0]!.trim().toLowerCase(),
      )
    ) {
      return response(415, { error: 'Unsupported content type' }, requestId)
    }

    try {
      const body = await readRawBody(request, maxBodyBytes, bodyTimeoutMs)
      const webhookId = verifyWebhook(request, body, config.secret)
      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder().decode(body))
      } catch {
        throw new CacheSchemaError('Invalid JSON')
      }
      const events = parseCloudEvents(parsed, contentType)
      if (events.length > maxEvents)
        throw new CacheSourceError(`Too many events (max ${maxEvents})`)

      const validated = await Promise.all(
        events.map(async (event) => {
          const schema = Object.hasOwn(config.sources, event.source)
            ? config.sources[event.source]
            : undefined
          if (!schema) throw new CacheSourceError(`Unknown source: ${event.source}`)
          return { ...event, data: await validateStandardSchema(schema, event.data) }
        }),
      )

      const plans = validated.flatMap((event): RulePlan[] => {
        const affected = getAffected(event)
        const context: RuleContext = {
          event,
          data: event.data,
          operation: isRecord(event.data) ? (event.data.operation as Operation) : undefined,
          resource:
            isRecord(event.data) && isRecord(event.data.resource)
              ? (event.data.resource as RevalidationResource)
              : undefined,
          affected,
          tags,
          paths,
        }
        return compiledRules.flatMap((rule): RulePlan[] => {
          if (!matchesEventSelector(event, rule.selector)) return []
          const matching = rule.selector.affected
            ? affected.filter(({ operation, resource }) =>
                matchesEventSelector(
                  { ...event, data: { operation, resource, affected: [{ operation, resource }] } },
                  { affected: rule.selector.affected },
                ),
              )
            : affected
          const result = rule.resolve({ ...context, affected: matching })
          if (!result) return []
          if (result.operations !== undefined && !Array.isArray(result.operations)) {
            throw new CacheSchemaError('Rule operations must be an array')
          }
          const custom = (result.operations ?? []).map((operation) => {
            if (
              !isRecord(operation) ||
              typeof operation.layer !== 'string' ||
              !operation.layer ||
              !Object.hasOwn(config.execute ?? {}, operation.layer)
            ) {
              throw new CacheConfigurationError('Rule references an unconfigured execution layer')
            }
            return { layer: operation.layer, value: operation.value }
          })
          const cache: CacheOperation[] = [
            ...asList(result.tags).map((item) => {
              const value = typeof item === 'string' ? item : item.value
              const mode = typeof item === 'string' ? result.mode : (item.mode ?? result.mode)
              const profile = parseTagProfile(mode, defaultMode)
              if (!value || value.length > 256)
                throw new CacheSchemaError('Invalid Next.js cache tag')
              return { kind: 'tag' as const, value, profile }
            }),
            ...asList(result.paths).map((item) => {
              const value = typeof item === 'string' ? item : item.value
              const type = typeof item === 'string' ? undefined : item.type
              if (!value || value.length > 1024 || !value.startsWith('/')) {
                throw new CacheSchemaError('Invalid Next.js cache path')
              }
              return { kind: 'path' as const, value, type }
            }),
          ]
          return [{ context: { ...context, affected: matching }, custom, cache }]
        })
      })
      const operationCount = plans.reduce((count, plan) => count + plan.custom.length, 0)
      if (operationCount > maxOperations) {
        throw new CacheSourceError(`Too many operations (max ${maxOperations})`)
      }

      const results: ExecutionResult[] = []
      const eligibleCacheOperations: CacheOperation[] = []
      const customOutcomes = new Map<string, 'success' | 'failed'>()
      let failed = false
      for (const plan of plans) {
        let planSucceeded = true
        for (const [index, operation] of plan.custom.entries()) {
          const key = JSON.stringify([plan.context.event.id, operation.layer, operation.value])
          const previous = customOutcomes.get(key)
          if (previous === 'success') {
            results.push({
              layer: operation.layer,
              operation: plan.context.event.id,
              status: 'success',
            })
            continue
          }
          if (previous === 'failed') {
            planSucceeded = false
            results.push({
              layer: operation.layer,
              operation: plan.context.event.id,
              status: 'skipped',
              error: {
                code: 'DEPENDENCY_FAILED',
                message: 'This custom operation already failed for the event',
              },
            })
            for (const skipped of plan.custom.slice(index + 1)) {
              results.push({
                layer: skipped.layer,
                operation: plan.context.event.id,
                status: 'skipped',
                error: {
                  code: 'DEPENDENCY_FAILED',
                  message: 'A preceding custom operation for this rule failed',
                },
              })
            }
            break
          }
          const controller = new AbortController()
          let timeoutHandle: ReturnType<typeof setTimeout>
          const timeout = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error('Custom cache execution timed out'))
              controller.abort()
            }, executionTimeoutMs)
          })
          try {
            await Promise.race([
              config.execute![operation.layer]!({
                ...plan.context,
                value: operation.value,
                signal: controller.signal,
              }),
              timeout,
            ])
            results.push({
              layer: operation.layer,
              operation: plan.context.event.id,
              status: 'success',
            })
            customOutcomes.set(key, 'success')
          } catch (error) {
            failed = true
            planSucceeded = false
            customOutcomes.set(key, 'failed')
            results.push({
              layer: operation.layer,
              operation: plan.context.event.id,
              status: 'failed',
              error: {
                code: controller.signal.aborted
                  ? 'CUSTOM_EXECUTION_TIMEOUT'
                  : 'CUSTOM_EXECUTION_FAILED',
                message: controller.signal.aborted
                  ? 'Custom cache execution timed out'
                  : 'Custom cache execution failed',
              },
            })
            config.logger?.error?.(
              {
                requestId,
                webhookId,
                eventId: plan.context.event.id,
                layer: operation.layer,
                error: error instanceof Error ? error.name : 'UnknownError',
              },
              'cache.layer.failed',
            )
            for (const skipped of plan.custom.slice(index + 1)) {
              results.push({
                layer: skipped.layer,
                operation: plan.context.event.id,
                status: 'skipped',
                error: {
                  code: 'DEPENDENCY_FAILED',
                  message: 'A preceding custom operation for this rule failed',
                },
              })
            }
            break
          } finally {
            clearTimeout(timeoutHandle!)
          }
        }
        if (planSucceeded) {
          eligibleCacheOperations.push(...plan.cache)
        } else {
          for (const operation of plan.cache) {
            results.push({
              layer: 'next',
              operation: operation.kind,
              status: 'skipped',
              error: {
                code: 'DEPENDENCY_FAILED',
                message: 'A custom operation for this rule failed',
              },
            })
          }
        }
      }

      const seen = new Set<string>()
      const unique = eligibleCacheOperations.filter((item) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      for (const item of unique) {
        try {
          if (item.kind === 'tag') await revalidateTag(item.value, item.profile)
          else {
            const type = item.type ?? (item.value.includes('[') ? 'page' : undefined)
            if (type) await revalidatePath(item.value, type)
            else await revalidatePath(item.value)
          }
          results.push({ layer: 'next', operation: item.kind, status: 'success' })
        } catch (error) {
          failed = true
          results.push({
            layer: 'next',
            operation: item.kind,
            status: 'failed',
            error: { code: 'CACHE_OPERATION_FAILED', message: 'Next.js cache operation failed' },
          })
          config.logger?.error?.(
            {
              requestId,
              webhookId,
              error: error instanceof Error ? error.name : 'UnknownError',
            },
            'cache.operation.failed',
          )
        }
      }
      return response(failed ? 500 : 200, { requestId, results }, requestId)
    } catch (error) {
      const status =
        error instanceof CacheRequestError
          ? 401
          : error instanceof CloudEventParseError
            ? 400
            : error instanceof CacheSourceError
              ? error.message === 'Request body timed out'
                ? 408
                : error.message === 'Request body too large' ||
                    error.message.startsWith('Too many events') ||
                    error.message.startsWith('Too many operations')
                  ? 413
                  : 400
              : error instanceof CacheSchemaError
                ? 400
                : 500
      config.logger?.error?.(
        {
          requestId,
          status,
          error: error instanceof Error ? error.name : 'UnknownError',
        },
        'cache.request.failed',
      )
      return response(
        status,
        {
          error:
            status >= 500
              ? 'Internal server error'
              : status === 408
                ? 'Request body timed out'
                : error instanceof Error
                  ? error.message
                  : 'Request failed',
          requestId,
        },
        requestId,
      )
    }
  }
  return { POST, tags, paths }
}
