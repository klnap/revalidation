import { Webhook } from 'standardwebhooks'
import { aggregateDispatchOutcomes, createDispatchError } from '../../core/dispatch-outcome.js'
import {
  assertLimit,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_EVENT_ITEMS,
  MAX_BODY_BYTES_CEILING,
  MAX_EVENT_ITEMS_CEILING,
} from '../../core/event-limits.js'
import {
  CLOUDEVENTS_BATCH_JSON,
  CLOUDEVENTS_JSON,
  matchesEventSelector,
  type CloudEvent,
  type Dispatcher,
  type DispatchInput,
  type DispatchOutcome,
  type TargetDispatchResult,
} from '../../core/index.js'
import { toTargetList, validateTarget, type TargetConfig } from '../../core/revalidation-target.js'

const MAX_CONCURRENT_DELIVERIES = 4
const MAX_RETRIES = 10
const MAX_ATTEMPT_TIMEOUT_MS = 60_000
const MAX_DEADLINE_MS = 300_000
const MAX_RETRY_DELAY_MS = 60_000

export type HttpDispatcherConfig = {
  targets: TargetConfig
  timeoutMs?: number
  deadlineMs?: number
  retries?: number
  retryDelayMs?: number
  allowInsecure?: boolean
  maxEventItems?: number
  maxBodyBytes?: number
}

type Target = ReturnType<typeof toTargetList>[number]

const assertIntegerRange = (name: string, value: number, min: number, max: number): number => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}; got ${value}`)
  }
  return value
}

type AttemptResult = {
  status: TargetDispatchResult['status']
  retryable: boolean
  error?: TargetDispatchResult['error']
}

type PostOptions = {
  body: string
  contentType: string
  deliveryId: string
  timestamp: Date
  timeoutMs: number
  deadline: AbortSignal
  allowInsecure: boolean
}

const isAllowedUrl = (url: string, allowInsecure: boolean): boolean => {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' &&
        (allowInsecure || ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))
    )
  } catch {
    return false
  }
}

const pause = (ms: number, deadline: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (deadline.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      deadline.removeEventListener('abort', done)
      resolve()
    }
    deadline.addEventListener('abort', done, { once: true })
  })

const attemptPost = async (target: Target, options: PostOptions): Promise<AttemptResult> => {
  if (options.deadline.aborted) {
    return {
      status: 'failed',
      retryable: false,
      error: createDispatchError('HTTP_DISPATCH_ERROR', 'dispatch deadline exceeded'),
    }
  }
  if (!isAllowedUrl(target.url, options.allowInsecure)) {
    return {
      status: 'failed',
      retryable: false,
      error: createDispatchError('HTTP_DISPATCH_ERROR', 'target URL must use https'),
    }
  }

  const attemptController = new AbortController()
  const abortFromDeadline = () => attemptController.abort()
  options.deadline.addEventListener('abort', abortFromDeadline, { once: true })
  const timeout = setTimeout(() => attemptController.abort(), options.timeoutMs)
  const timestamp = options.timestamp
  const webhook = new Webhook(target.secret)
  const signature = webhook.sign(options.deliveryId, timestamp, options.body)

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': options.contentType,
        'webhook-id': options.deliveryId,
        'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'webhook-signature': signature,
      },
      body: options.body,
      signal: attemptController.signal,
      redirect: 'manual',
    })
    await response.body?.cancel().catch(() => undefined)
    if (response.status >= 200 && response.status < 300) {
      return { status: 'accepted', retryable: false }
    }
    if (response.status === 429) {
      return {
        status: 'rejected',
        retryable: true,
        error: createDispatchError('HTTP_REJECTED', 'HTTP 429'),
      }
    }
    if (response.status >= 500) {
      return {
        status: 'failed',
        retryable: true,
        error: createDispatchError('HTTP_FAILED', `HTTP ${response.status}`),
      }
    }
    if (response.status >= 400) {
      return {
        status: 'rejected',
        retryable: false,
        error: createDispatchError('HTTP_REJECTED', `HTTP ${response.status}`),
      }
    }
    return {
      status: 'failed',
      retryable: false,
      error: createDispatchError('HTTP_REDIRECT', `redirect refused (HTTP ${response.status})`),
    }
  } catch {
    const timedOut = attemptController.signal.aborted
    return {
      status: 'unknown',
      retryable: true,
      error: createDispatchError(
        timedOut ? 'HTTP_TIMEOUT' : 'HTTP_NETWORK_ERROR',
        timedOut ? 'HTTP dispatch timed out' : 'HTTP dispatch failed',
      ),
    }
  } finally {
    clearTimeout(timeout)
    options.deadline.removeEventListener('abort', abortFromDeadline)
  }
}

const postChunk = async (
  target: Target,
  events: readonly CloudEvent[],
  options: Omit<PostOptions, 'body' | 'contentType' | 'deliveryId' | 'timestamp'> & {
    retries: number
    retryDelayMs: number
  },
): Promise<TargetDispatchResult> => {
  const isBatch = events.length !== 1
  const body = JSON.stringify(isBatch ? events : events[0])
  const contentType = isBatch ? CLOUDEVENTS_BATCH_JSON : CLOUDEVENTS_JSON
  const deliveryId = `wh_${crypto.randomUUID()}`
  let last: AttemptResult | undefined
  let attempts = 0
  let lastTimestamp = 0

  while (attempts <= options.retries) {
    if (attempts > 0) {
      await pause(Math.random() * options.retryDelayMs * 2 ** (attempts - 1), options.deadline)
    }
    if (options.deadline.aborted) break
    attempts += 1
    const timestampMs = Math.max(Date.now(), lastTimestamp + 1000)
    lastTimestamp = timestampMs
    last = await attemptPost(target, {
      body,
      contentType,
      deliveryId,
      timestamp: new Date(timestampMs),
      timeoutMs: options.timeoutMs,
      deadline: options.deadline,
      allowInsecure: options.allowInsecure,
    })
    if (!last.retryable || last.status === 'accepted') break
  }

  return {
    target: target.name,
    deliveryId,
    status: last?.status ?? 'failed',
    attempts,
    ...((last?.error || !last) && {
      error:
        last?.error ?? createDispatchError('HTTP_DISPATCH_ERROR', 'dispatch deadline exceeded'),
    }),
  }
}

const chunkEvents = (
  events: readonly CloudEvent[],
  maxItems: number,
  maxBytes: number,
): { events: CloudEvent[]; tooLarge: boolean }[] => {
  const encoder = new TextEncoder()
  const result: { events: CloudEvent[]; tooLarge: boolean }[] = []
  let current: CloudEvent[] = []
  let currentEventBytes = 0
  for (const event of events) {
    const eventBytes = encoder.encode(JSON.stringify(event)).byteLength
    const singleTooLarge = eventBytes > maxBytes
    if (singleTooLarge) {
      if (current.length) result.push({ events: current, tooLarge: false })
      current = []
      currentEventBytes = 0
      result.push({ events: [event], tooLarge: true })
      continue
    }
    const candidateBytes = current.length
      ? currentEventBytes + eventBytes + current.length + 2
      : eventBytes
    if (current.length && (current.length + 1 > maxItems || candidateBytes > maxBytes)) {
      result.push({ events: current, tooLarge: false })
      current = [event]
      currentEventBytes = eventBytes
    } else {
      current.push(event)
      currentEventBytes += eventBytes
    }
  }
  if (current.length) result.push({ events: current, tooLarge: false })
  return result
}

const runBounded = async <T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_DELIVERIES, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await worker(items[index]!)
      }
    }),
  )
  return results
}

export const http = (config: HttpDispatcherConfig): Dispatcher => {
  if (!Object.keys(config.targets).length) throw new Error('http dispatcher requires targets')
  for (const [name, target] of Object.entries(config.targets)) {
    validateTarget(name, target, config.allowInsecure)
    new Webhook(target.secret)
  }
  const maxEventItems = assertLimit(
    'maxEventItems',
    config.maxEventItems ?? DEFAULT_MAX_EVENT_ITEMS,
    MAX_EVENT_ITEMS_CEILING,
  )
  const maxBodyBytes = assertLimit(
    'maxBodyBytes',
    config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    MAX_BODY_BYTES_CEILING,
  )
  const timeoutMs = assertIntegerRange(
    'timeoutMs',
    config.timeoutMs ?? 15_000,
    1,
    MAX_ATTEMPT_TIMEOUT_MS,
  )
  const deadlineMs = assertIntegerRange(
    'deadlineMs',
    config.deadlineMs ?? 5_000,
    1,
    MAX_DEADLINE_MS,
  )
  const retries = assertIntegerRange('retries', config.retries ?? 2, 0, MAX_RETRIES)
  const retryDelayMs = assertIntegerRange(
    'retryDelayMs',
    config.retryDelayMs ?? 200,
    0,
    MAX_RETRY_DELAY_MS,
  )
  const allowInsecure = config.allowInsecure ?? false

  return {
    maxEventItems,
    async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
      const allTargets = toTargetList(config.targets)
      const selectedNames = input.targets ?? allTargets.map(({ name }) => name)
      const unknown = selectedNames.filter((name) => !Object.hasOwn(config.targets, name))
      if (unknown.length) {
        return {
          status: 'rejected',
          results: unknown.map((target) => ({
            target,
            deliveryId: `wh_${crypto.randomUUID()}`,
            status: 'rejected' as const,
            attempts: 0,
            error: createDispatchError('UNKNOWN_TARGET', `unknown target "${target}"`),
          })),
        }
      }
      const selected = new Set(selectedNames)
      const jobs = allTargets
        .filter(({ name }) => selected.has(name))
        .flatMap((target) => {
          const events = input.events.filter(
            (event) => !target.filter || matchesEventSelector(event, target.filter),
          )
          return chunkEvents(events, maxEventItems, maxBodyBytes).map((chunk) => ({
            target,
            ...chunk,
          }))
        })
      if (!jobs.length) return { status: 'accepted', results: [] }

      const deadline = new AbortController()
      const timer = setTimeout(() => deadline.abort(), deadlineMs)
      try {
        const results = await runBounded(jobs, ({ target, events, tooLarge }) =>
          tooLarge
            ? Promise.resolve({
                target: target.name,
                deliveryId: `wh_${crypto.randomUUID()}`,
                status: 'failed' as const,
                attempts: 0,
                error: createDispatchError(
                  'HTTP_BODY_TOO_LARGE',
                  'request body exceeds maxBodyBytes',
                ),
              })
            : postChunk(target, events, {
                timeoutMs,
                deadline: deadline.signal,
                allowInsecure,
                retries,
                retryDelayMs,
              }),
        )
        return aggregateDispatchOutcomes(results)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
