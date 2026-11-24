import { createHash, timingSafeEqual } from 'node:crypto'
import { DEFAULT_MAX_EVENT_ITEMS } from '../../core/event-limits.js'
import {
  CacheExecutionError,
  CacheRequestError,
  CacheSchemaError,
  CacheSourceError,
  createPipeline,
  type InspectResult,
  type Logger,
  toHttpStatus,
} from '../../core/index.js'
import { normalizeItems } from '../../core/normalize.js'
import type { PipelineConfig } from '../../core/pipeline.js'
import { executeNextLayer } from './execute-next.js'
import type { NextRevalidationHandlerConfig } from './handler-config.js'
import { inspectHostEnvelope, processHostEnvelope } from './process-host-envelope.js'

export type { NextRevalidationHandlerConfig } from './handler-config.js'

export const logRevalidationDebug = (
  logger: Logger | undefined,
  requestId: string,
  envelope: { source: string; data: unknown },
  result: InspectResult,
): void => {
  if (!logger?.debug) return

  const layers = Object.fromEntries(
    Object.entries(result.layers).map(([name, ops]) => [
      name,
      {
        tags: ops.tags.map((t) => t.value),
        paths: ops.paths.map((p) => p.value),
      },
    ]),
  )

  logger.debug(
    {
      requestId,
      source: envelope.source,
      items: result.items.length,
      cacheKeys: result.cacheKeys,
      layers,
    },
    'cache.revalidate.processed',
  )
}

const authorize = (authorization: string | null, secret: string): void => {
  // Equal-length digests let timingSafeEqual compare without leaking the secret's length.
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (
    !secret ||
    !authorization ||
    !timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
  ) {
    throw new CacheRequestError('Unauthorized')
  }
}

const readRequestBody = async (request: Request, maxBodyBytes: number): Promise<string> => {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null && Number(declaredLength) > maxBodyBytes) {
    throw new CacheSourceError('Request body too large')
  }

  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBodyBytes) {
        await reader.cancel().catch(() => {})
        throw new CacheSourceError('Request body too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

export const createCache = (config: NextRevalidationHandlerConfig) => {
  const mode = config.mode ?? 'expire'
  const maxBodyBytes = config.maxBodyBytes ?? 256 * 1024
  const maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENT_ITEMS

  const pipelineConfig: PipelineConfig = {
    mode,
    sources: config.sources,
    cache: {
      tags: config.cache.tags,
      paths: config.cache.paths ?? {},
    },
    layers: config.layers,
    logger: config.logger,
  }

  const pipeline = createPipeline(pipelineConfig)

  const inspect = (input: { source: string; data: unknown }): InspectResult => {
    if (config.host) {
      return inspectHostEnvelope(
        config.host,
        { source: input.source, data: input.data },
        mode,
        maxEvents,
      )
    }
    return pipeline.inspect(input)
  }

  const executeLayers = async (result: InspectResult, requestId: string): Promise<void> => {
    const failures: string[] = []

    for (const [layerName, operations] of Object.entries(result.layers)) {
      try {
        const custom = config.execute?.[layerName]
        if (custom) {
          await custom({
            ...operations,
            requestId,
            source: result.source,
            cacheKeys: result.cacheKeys,
          })
        } else {
          await executeNextLayer(operations)
        }
      } catch (error) {
        failures.push(layerName)
        config.logger?.error?.({ requestId, layer: layerName, error }, 'cache.layer.executed')
      }
    }

    if (failures.length > 0) {
      throw new CacheExecutionError(`Layer execution failed: ${failures.join(', ')}`)
    }
  }

  const processEnvelope = async (
    envelope: { source: string; data: unknown },
    requestId: string,
  ): Promise<InspectResult> => {
    const normalized = normalizeItems(envelope.data)

    if (normalized.length > maxEvents) {
      throw new CacheSourceError(`Too many events (max ${maxEvents})`)
    }

    let result: InspectResult
    if (config.host) {
      result = await processHostEnvelope(
        config.host,
        envelope,
        requestId,
        mode,
        maxEvents,
        config.logger,
      )
    } else {
      const parsed = pipeline.parseSource(envelope.source, normalized)
      result = pipeline.resolveOperations(envelope.source, parsed)
    }

    logRevalidationDebug(config.logger, requestId, envelope, result)

    await executeLayers(result, requestId)
    return result
  }

  const route = async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()

    try {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      authorize(request.headers.get('authorization'), config.secret)

      const raw = await readRequestBody(request, maxBodyBytes)

      let body: unknown
      try {
        body = JSON.parse(raw)
      } catch {
        throw new CacheSchemaError('Invalid JSON')
      }

      if (!body || typeof body !== 'object' || !('source' in body)) {
        throw new CacheSourceError('Missing source')
      }

      const envelope = body as { source: string; data: unknown }
      if (typeof envelope.source !== 'string' || !envelope.source) {
        throw new CacheSourceError('Invalid source')
      }

      const result = await processEnvelope(envelope, requestId)

      return new Response(
        JSON.stringify({ success: true, requestId, cacheKeys: result.cacheKeys }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache-Request-Id': requestId,
          },
        },
      )
    } catch (error) {
      const status = toHttpStatus(error)
      const message = error instanceof Error ? error.message : 'Request failed'
      config.logger?.error?.({ requestId, status, error }, 'cache.request.failed')
      return new Response(JSON.stringify({ error: message, requestId }), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Request-Id': requestId,
        },
      })
    }
  }

  return { route, inspect }
}

/** Next.js route handler: `export const POST = createRevalidationHandler(config)`. */
export const createRevalidationHandler = (
  config: NextRevalidationHandlerConfig,
): ((request: Request) => Promise<Response>) => createCache(config).route
