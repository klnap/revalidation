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
  type Operation,
  type RevalidationResource,
} from '../../core/index.js'
import { assertTagValue, pathValueProblem } from './param-values.js'
import {
  assertLimit,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_EVENT_ITEMS,
  MAX_BODY_BYTES_CEILING,
  MAX_EVENT_ITEMS_CEILING,
} from '../../core/event-limits.js'
import { buildPathDefs, buildTagDefs } from './registry-builders.js'
import type { PathTemplate, TagTemplate } from './host-types.js'
import { getTagTemplateMeta, type TemplateMetaCarrier } from './compile-tag-template.js'
import { PATH_SYMBOL, TAG_SYMBOL, type PathReference, type TagReference } from './host-types.js'
import type {
  DefineRevalidationInput,
  DefinedRevalidation,
  EventSchemas,
  ExecutorMap,
  RuleHelpers,
  SchemaMap,
  EventOutput,
} from './consumer-types.js'
// Node ESM resolves this Next.js entry through its explicit `.js` export.
import { revalidatePath, revalidateTag } from 'next/cache.js'

type CacheProfile = string | { expire: number }
type TagResult = TagReference | string | readonly [TagReference | string, CacheProfile?]
type PathResult = PathReference | string | readonly [PathReference | string, 'page' | 'layout']
type RuleResult = {
  tags?: readonly TagResult[]
  paths?: readonly PathResult[]
  profile?: CacheProfile
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
type DeclarativeRule =
  | readonly TagReference[]
  | {
      tags?: readonly TagReference[]
      paths?: readonly PathReference[]
      profile?: CacheProfile
    }
type RuleAction = DeclarativeRule | Resolver
type CompiledRule = {
  readonly [COMPILED_RULE]: true
  resourceKeys?: readonly string[]
  selector?: EventSelector
  action: RuleAction
}
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
type RulePlan<TData = unknown> = {
  context: RuleContext<TData>
  custom: readonly CustomOperation[]
  cache: readonly CacheOperation[]
  diagnostics: readonly string[]
}
type ExecutionResult = {
  layer: string
  operation: string
  status: 'success' | 'failed' | 'skipped'
  error?: { code: string; message: string }
}

export type NextRuntimeConfig<
  TTags extends Record<string, TagTemplate> = Record<never, never>,
  TPaths extends Record<string, PathTemplate> = Record<never, never>,
  TSchemas extends SchemaMap = SchemaMap,
  TExecutors extends ExecutorMap<EventOutput<TSchemas>> = ExecutorMap<EventOutput<TSchemas>>,
> = Omit<DefineRevalidationInput<TTags, TPaths, TSchemas, TExecutors>, 'schemas'> & {
  schemas: SchemaMap
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCacheProfile = (value: unknown): value is CacheProfile =>
  typeof value === 'string'
    ? value.length > 0
    : isRecord(value) &&
      Object.keys(value).every((key) => key === 'expire') &&
      typeof value.expire === 'number' &&
      Number.isFinite(value.expire) &&
      value.expire >= 0

const asList = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value as T]

const COMPILED_RULE = Symbol('compiled revalidation rule')

type CompiledRuleValue = CompiledRule & { readonly [COMPILED_RULE]: true }

const isCompiledRule = (value: unknown): value is CompiledRuleValue =>
  isRecord(value) && Reflect.get(value, COMPILED_RULE) === true

const isTagReference = (value: unknown): value is TagReference =>
  typeof value === 'function' && TAG_SYMBOL in value

const isPathReference = (value: unknown): value is PathReference =>
  typeof value === 'function' && PATH_SYMBOL in value

const assertReference = (
  value: unknown,
  kind: 'tag' | 'path',
  tags: Readonly<Record<string, TagReference>>,
  paths: Readonly<Record<string, PathReference>>,
): void => {
  if (kind === 'tag') {
    if (!isTagReference(value)) {
      throw new CacheConfigurationError('Declarative tag rules must use tag references')
    }
    const id = value[TAG_SYMBOL]
    if (!id || tags[id] !== value) {
      throw new CacheConfigurationError('Declarative tag reference is not from this configuration')
    }
    return
  }
  if (!isPathReference(value)) {
    throw new CacheConfigurationError('Declarative path rules must use path references')
  }
  const id = value[PATH_SYMBOL]
  if (!id || paths[id] !== value) {
    throw new CacheConfigurationError('Declarative path reference is not from this configuration')
  }
}

const validateDeclarativeRule: (
  action: unknown,
  tags: Readonly<Record<string, TagReference>>,
  paths: Readonly<Record<string, PathReference>>,
) => void = (
  action: unknown,
  tags: Readonly<Record<string, TagReference>>,
  paths: Readonly<Record<string, PathReference>>,
): void => {
  const tagValues = Array.isArray(action)
    ? action
    : isRecord(action) && action.tags !== undefined
      ? action.tags
      : []
  const pathValues =
    !Array.isArray(action) && isRecord(action) && action.paths !== undefined ? action.paths : []
  if (!Array.isArray(tagValues) || !Array.isArray(pathValues)) {
    throw new CacheConfigurationError('Declarative rules require tag and path arrays')
  }
  if (!Array.isArray(action)) {
    if (!isRecord(action) || !('tags' in action || 'paths' in action || 'profile' in action)) {
      throw new CacheConfigurationError('Invalid declarative rule')
    }
    if ('profile' in action && action.profile !== undefined) {
      if (!isCacheProfile(action.profile)) {
        throw new CacheConfigurationError('Invalid declarative cache profile')
      }
    }
  }
  for (const value of tagValues) {
    const reference = Array.isArray(value) ? value[0] : value
    if (
      (Array.isArray(value) &&
        (value.length < 1 ||
          value.length > 2 ||
          (value[1] !== undefined && !isCacheProfile(value[1])))) ||
      !isTagReference(reference)
    ) {
      throw new CacheConfigurationError('Declarative tag rules must use tag references')
    }
    assertReference(reference, 'tag', tags, paths)
  }
  for (const value of pathValues) {
    const reference = Array.isArray(value) ? value[0] : value
    if (
      (Array.isArray(value) &&
        (value.length !== 2 || (value[1] !== 'page' && value[1] !== 'layout'))) ||
      !isPathReference(reference)
    ) {
      throw new CacheConfigurationError('Declarative path rules must use path references')
    }
    assertReference(reference, 'path', tags, paths)
    if (Array.isArray(value)) {
      const meta = getTagTemplateMeta(reference as TemplateMetaCarrier)
      if (meta?.keys.length) {
        throw new CacheConfigurationError('Scoped declarative paths must not contain parameters')
      }
    }
  }
}

const declarativeResult = (action: DeclarativeRule): RuleResult => {
  if (Array.isArray(action)) return { tags: [...(action as readonly TagReference[])] }
  return action as Exclude<DeclarativeRule, readonly TagReference[]>
}

const normalizeRules = (
  rules: unknown,
  on: (
    selectorOrKeys: EventSelector | string | readonly string[],
    action: unknown,
  ) => CompiledRuleValue,
  tags: Readonly<Record<string, TagReference>>,
  paths: Readonly<Record<string, PathReference>>,
): CompiledRuleValue[] => {
  const output: CompiledRuleValue[] = []
  const addMapping = (mapping: unknown) => {
    if (!isRecord(mapping))
      throw new CacheConfigurationError('Rules must be a resource-key mapping')
    for (const [key, action] of Object.entries(mapping)) {
      if (!key) throw new CacheConfigurationError('Resource rule keys must not be empty')
      validateDeclarativeRule(action, tags, paths)
      output.push(on(key, action))
    }
  }
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    if (isCompiledRule(rule)) {
      if (typeof rule.action === 'function') output.push(rule)
      else {
        validateDeclarativeRule(rule.action, tags, paths)
        output.push(rule)
      }
    } else {
      addMapping(rule)
    }
  }
  return output
}

const isOperation = (value: unknown): value is Operation =>
  value === 'create' || value === 'update' || value === 'delete'

const getAffected = (
  event: CloudEvent,
  requireCanonical: boolean,
): { operation: Operation; resource: RevalidationResource }[] => {
  const data = event.data
  if (!isRecord(data) || !Array.isArray(data.affected)) {
    if (requireCanonical) {
      throw new CacheSchemaError('Resource-key rules require canonical affected resources')
    }
    return []
  }
  const affected: { operation: Operation; resource: RevalidationResource }[] = []
  for (const item of data.affected) {
    if (
      !isRecord(item) ||
      !isOperation(item.operation) ||
      !isRecord(item.resource) ||
      typeof item.resource.type !== 'string' ||
      item.resource.type.length === 0
    ) {
      if (requireCanonical) {
        throw new CacheSchemaError('Resource-key rules require canonical affected resources')
      }
      continue
    }
    const resource = item.resource
    if (resource.name !== undefined && (typeof resource.name !== 'string' || !resource.name)) {
      if (requireCanonical) {
        throw new CacheSchemaError('Resource-key rules require non-empty resource names')
      }
      continue
    }
    if (requireCanonical && resource.name?.includes('.')) {
      throw new CacheSchemaError('Ambiguous resource names require a structured on() selector')
    }
    affected.push({
      operation: item.operation,
      resource: resource as RevalidationResource,
    })
  }
  return affected
}

const canonicalResourceKey = (resource: RevalidationResource): string =>
  resource.name === undefined ? resource.type : `${resource.type}.${resource.name}`

const parseTagProfile = (profile: CacheProfile | undefined): CacheProfile =>
  profile ?? { expire: 0 }

const paramsFromResource = (resource: RevalidationResource): Record<string, string | undefined> => {
  const params: Record<string, string | undefined> = Object.create(null)
  if (resource.identifiers) {
    for (const [key, value] of Object.entries(resource.identifiers)) params[key] = value
  }
  params.id = resource.id
  params.locale = resource.locale
  params.slug = resource.slug ?? resource.identifiers?.slug
  return params
}

const renderReference = (
  reference: TagReference | PathReference,
  kind: 'tag' | 'path',
  resource: RevalidationResource,
  tags: Readonly<Record<string, TagReference>>,
  paths: Readonly<Record<string, PathReference>>,
): { value?: string; missing?: readonly string[] } => {
  assertReference(reference, kind, tags, paths)
  const meta = getTagTemplateMeta(reference as TemplateMetaCarrier)
  if (!meta) throw new CacheConfigurationError(`Invalid ${kind} template reference`)
  const params = paramsFromResource(resource)
  const missing = meta.keys.filter((key) => params[key] === undefined || params[key] === '')
  if (missing.length) return { missing }
  if (kind === 'tag') {
    for (const key of meta.keys) {
      const value = params[key]
      if (value !== undefined) assertTagValue(key, value)
    }
  }
  if (kind === 'path') {
    for (const key of meta.keys) {
      const value = params[key]
      if (value === undefined) continue
      const problem = pathValueProblem(value)
      if (problem) {
        throw new CacheSchemaError(`Invalid path parameter "${key}": ${problem}`)
      }
    }
  }
  const value = meta.render(params)
  if (value === null) return { missing: meta.keys }
  return { value }
}

const concreteCacheOperations = (
  result: RuleResult,
  resources: readonly { operation: Operation; resource: RevalidationResource }[],
  tags: Readonly<Record<string, TagReference>>,
  paths: Readonly<Record<string, PathReference>>,
  defaultProfile: CacheProfile | undefined,
  maxOperations: number,
): { cache: CacheOperation[]; diagnostics: string[]; planned: number } => {
  const cache: CacheOperation[] = []
  const diagnostics: string[] = []
  let planned = 0
  const countCandidate = () => {
    if (planned >= maxOperations) {
      throw new CacheSourceError(`Too many operations (max ${maxOperations})`)
    }
    planned += 1
  }
  const add = (operation: CacheOperation) => {
    cache.push(operation)
  }
  const candidates = resources.length ? resources : [undefined]
  const tagValues = asList(result.tags)
  const pathValues = asList(result.paths)

  for (const item of tagValues) {
    if (
      !item ||
      (Array.isArray(item)
        ? item.length < 1 ||
          item.length > 2 ||
          (typeof item[0] !== 'string' && !isTagReference(item[0]))
        : typeof item !== 'string' && !isTagReference(item))
    ) {
      throw new CacheSchemaError('Invalid Next.js cache tag')
    }
    const raw: unknown = Array.isArray(item) ? item[0] : item
    const profile: unknown = Array.isArray(item) ? item[1] : undefined
    const inheritedProfile =
      profile !== undefined
        ? profile
        : result.profile !== undefined
          ? result.profile
          : defaultProfile
    if (inheritedProfile !== undefined && !isCacheProfile(inheritedProfile)) {
      throw new CacheSchemaError('Invalid Next.js cache profile')
    }
    const effectiveProfile = parseTagProfile(inheritedProfile as CacheProfile | undefined)
    for (const candidate of isTagReference(raw) ? candidates : [undefined]) {
      countCandidate()
      let value: string | undefined
      if (isTagReference(raw)) {
        if (!candidate) {
          diagnostics.push('Tag reference requires an affected resource')
          continue
        }
        const rendered = renderReference(raw, 'tag', candidate.resource, tags, paths)
        value = rendered.value
        if (rendered.missing) {
          diagnostics.push(`Tag template is missing parameter(s): ${rendered.missing.join(', ')}`)
          continue
        }
      } else if (typeof raw === 'string') {
        value = raw
      }
      if (
        typeof effectiveProfile === 'string'
          ? !effectiveProfile
          : effectiveProfile.expire !== undefined &&
            (!Number.isFinite(effectiveProfile.expire) || effectiveProfile.expire < 0)
      ) {
        throw new CacheSchemaError('Invalid Next.js cache profile')
      }
      if (!value || value.length > 256) {
        throw new CacheSchemaError('Invalid Next.js cache tag')
      }
      add({ kind: 'tag', value, profile: effectiveProfile })
    }
  }

  for (const item of pathValues) {
    if (
      !item ||
      (Array.isArray(item)
        ? item.length !== 2 || (typeof item[0] !== 'string' && !isPathReference(item[0]))
        : typeof item !== 'string' && !isPathReference(item))
    ) {
      throw new CacheSchemaError('Invalid Next.js cache path')
    }
    const raw: unknown = Array.isArray(item) ? item[0] : item
    const type: unknown = Array.isArray(item) ? item[1] : undefined
    if (type !== undefined && type !== 'page' && type !== 'layout') {
      throw new CacheSchemaError('Invalid Next.js cache path type')
    }
    for (const candidate of isPathReference(raw) ? candidates : [undefined]) {
      countCandidate()
      let value: string | undefined
      if (isPathReference(raw)) {
        if (!candidate) {
          diagnostics.push('Path reference requires an affected resource')
          continue
        }
        const rendered = renderReference(raw, 'path', candidate.resource, tags, paths)
        value = rendered.value
        if (rendered.missing) {
          diagnostics.push(`Path template is missing parameter(s): ${rendered.missing.join(', ')}`)
          continue
        }
      } else if (typeof raw === 'string') {
        value = raw
      }
      if (!value || value.length > 1024 || !value.startsWith('/')) {
        throw new CacheSchemaError('Invalid Next.js cache path')
      }
      add({ kind: 'path', value, type })
    }
  }
  return { cache, diagnostics, planned }
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

export const createRevalidationPostHandler = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TSchemas extends SchemaMap,
  TExecutors extends ExecutorMap<EventOutput<TSchemas>>,
>(
  config: NextRuntimeConfig<TTags, TPaths, TSchemas, TExecutors>,
): DefinedRevalidation<TTags, TPaths> => {
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
  const tags = buildTagDefs<TTags>(config.tags ?? ({} as TTags))
  const paths = buildPathDefs<TPaths>(config.paths ?? ({} as TPaths))
  if (
    config.allowedSources?.some((source) => {
      try {
        return new URL(source).protocol.length === 0
      } catch {
        return true
      }
    })
  ) {
    throw new CacheConfigurationError('allowedSources must contain absolute URIs')
  }
  const createRule = (
    selectorOrKeys: EventSelector | string | readonly string[],
    action: unknown,
  ): CompiledRuleValue => {
    const isResourceKey = typeof selectorOrKeys === 'string' || Array.isArray(selectorOrKeys)
    const resourceKeys =
      typeof selectorOrKeys === 'string'
        ? [selectorOrKeys]
        : Array.isArray(selectorOrKeys)
          ? selectorOrKeys
          : undefined
    const selector = resourceKeys ? undefined : (selectorOrKeys as EventSelector)
    if (resourceKeys && (!resourceKeys.length || resourceKeys.some((key) => !key))) {
      throw new CacheConfigurationError('on() resource keys must not be empty')
    }
    if (!isResourceKey && (!selector || !isRecord(selector))) {
      throw new CacheConfigurationError('on() requires a resource key or structured selector')
    }
    if (typeof action !== 'function') validateDeclarativeRule(action, tags, paths)
    return {
      [COMPILED_RULE]: true,
      ...(resourceKeys ? { resourceKeys: [...resourceKeys] } : { selector }),
      action: action as RuleAction,
    }
  }
  const on = createRule as RuleHelpers<
    EventSchemas<TSchemas>,
    TTags,
    TPaths,
    keyof TExecutors & string
  >['on']
  const compiledRules = normalizeRules(config.rules({ tags, paths, on }), createRule, tags, paths)
  const hasResourceKeyRules = compiledRules.some((rule) => rule.resourceKeys !== undefined)
  const defaultProfile = config.profile

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

      const validated: CloudEvent<EventOutput<TSchemas>>[] = await Promise.all(
        events.map(async (event) => {
          if (config.allowedSources && !config.allowedSources.includes(event.source)) {
            throw new CacheSourceError(`Disallowed source: ${event.source}`)
          }
          const schema = Object.hasOwn(config.schemas, event.type)
            ? config.schemas[event.type]
            : undefined
          if (!schema) throw new CacheSourceError(`Unknown event type: ${event.type}`)
          return {
            ...event,
            data: (await validateStandardSchema(schema, event.data)) as EventOutput<TSchemas>,
          }
        }),
      )
      const seenEventIdentities = new Set<string>()
      const uniqueEvents = validated.filter((event) => {
        const identity = `${event.source}\u0000${event.id}`
        if (seenEventIdentities.has(identity)) return false
        seenEventIdentities.add(identity)
        return true
      })

      const plans: RulePlan<EventOutput<TSchemas>>[] = []
      let plannedOperationCount = 0
      for (const event of uniqueEvents) {
        const affected = getAffected(event, hasResourceKeyRules)
        const context: RuleContext<EventOutput<TSchemas>> = {
          event,
          data: event.data,
          operation:
            isRecord(event.data) && isOperation(event.data.operation)
              ? event.data.operation
              : undefined,
          resource:
            isRecord(event.data) && isRecord(event.data.resource)
              ? (event.data.resource as RevalidationResource)
              : undefined,
          affected,
          tags,
          paths,
        }
        for (const rule of compiledRules) {
          let matching: typeof affected
          if (rule.resourceKeys) {
            const keys = new Set(rule.resourceKeys)
            matching = affected.filter(({ resource }) => keys.has(canonicalResourceKey(resource)))
            if (!matching.length) continue
          } else {
            if (!rule.selector || !matchesEventSelector(event, rule.selector)) continue
            matching = rule.selector.affected
              ? affected.filter(({ operation, resource }) =>
                  matchesEventSelector(
                    {
                      ...event,
                      data: { operation, resource, affected: [{ operation, resource }] },
                    },
                    { affected: rule.selector?.affected },
                  ),
                )
              : affected
          }
          const ruleContext = { ...context, affected: matching }
          const result: RuleResult | null | undefined =
            typeof rule.action === 'function'
              ? rule.action(ruleContext)
              : declarativeResult(rule.action)
          if (!result) continue
          if (!isRecord(result)) throw new CacheSchemaError('Invalid revalidation rule result')
          if (result.operations !== undefined && !Array.isArray(result.operations)) {
            throw new CacheSchemaError('Rule operations must be an array')
          }
          const custom = asList(result.operations as readonly unknown[] | undefined).map(
            (operation) => {
              if (
                !isRecord(operation) ||
                typeof operation.layer !== 'string' ||
                !operation.layer ||
                !Object.hasOwn(config.execute ?? {}, operation.layer)
              ) {
                throw new CacheConfigurationError('Rule references an unconfigured execution layer')
              }
              return { layer: operation.layer, value: operation.value }
            },
          )
          const referenceResources =
            matching.length > 0
              ? matching
              : context.resource && context.operation
                ? [{ operation: context.operation, resource: context.resource }]
                : []
          const normalized = {
            tags: asList(result.tags as readonly TagResult[] | undefined),
            paths: asList(result.paths as readonly PathResult[] | undefined),
            profile: result.profile as RuleResult['profile'],
          }
          const operationBudget = maxOperations - plannedOperationCount - custom.length
          if (operationBudget < 0) {
            throw new CacheSourceError(`Too many operations (max ${maxOperations})`)
          }
          const { cache, diagnostics, planned } = concreteCacheOperations(
            normalized,
            referenceResources,
            tags,
            paths,
            defaultProfile,
            operationBudget,
          )
          plannedOperationCount += custom.length + planned
          if (plannedOperationCount > maxOperations) {
            throw new CacheSourceError(`Too many operations (max ${maxOperations})`)
          }
          plans.push({ context: ruleContext, custom, cache, diagnostics })
        }
      }

      const tagProfiles = new Map<string, string>()
      for (const operation of plans.flatMap((plan) => plan.cache)) {
        if (operation.kind !== 'tag') continue
        const profile =
          typeof operation.profile === 'string'
            ? operation.profile
            : JSON.stringify({ expire: operation.profile.expire })
        const existing = tagProfiles.get(operation.value)
        if (existing !== undefined && existing !== profile) {
          throw new CacheSchemaError(
            `Conflicting Next.js cache profiles for tag "${operation.value}"`,
          )
        }
        tagProfiles.set(operation.value, profile)
      }

      const results: ExecutionResult[] = plans.flatMap((plan) =>
        plan.diagnostics.map((message) => ({
          layer: 'next',
          operation: 'template',
          status: 'skipped' as const,
          error: { code: 'MISSING_TEMPLATE_PARAM', message },
        })),
      )
      for (const plan of plans) {
        for (const message of plan.diagnostics) {
          config.logger?.warn?.(
            { requestId, eventId: plan.context.event.id, code: 'MISSING_TEMPLATE_PARAM', message },
            'cache.template.incomplete',
          )
        }
      }
      const eligibleCacheOperations: CacheOperation[] = []
      let failed = plans.some((plan) => plan.diagnostics.length > 0)
      for (const plan of plans) {
        let planSucceeded = true
        for (const [index, operation] of plan.custom.entries()) {
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
          } catch (error) {
            failed = true
            planSucceeded = false
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
            const type = item.type
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
