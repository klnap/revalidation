import { aggregateDispatchOutcomes, createDispatchError } from '../../core/dispatch-outcome.js'
import type { CacheEvent, Dispatcher, DispatchInput, DispatchOutcome } from '../../core/index.js'
import { resolveRevalidationTargets } from '../routing/resolve-target.js'
import type { RevalidationTarget, TargetConfig } from '../routing/target-config.js'

const MAX_CONCURRENT_DELIVERIES = 4

export type HttpDispatcherConfig = {
  /** Overrides `revalidation({ target })` when set. Single object or array. */
  target?: TargetConfig
  /** Per-attempt timeout. */
  timeoutMs?: number
  /** Overall budget for one dispatch call, retries included. Default 5 s. */
  deadlineMs?: number
  /** Retries after the first attempt for retryable failures. Default 2 (three attempts). */
  retries?: number
  /** Base delay before the first retry; each retry waits a random time up to double the previous bound. Default 200 ms. */
  retryDelayMs?: number
}

const missingTargetOutcome = (): DispatchOutcome => ({
  status: 'failed',
  error: createDispatchError(
    'HTTP_DISPATCH_ERROR',
    'http dispatcher requires target in http({ target }) or revalidation({ target })',
  ),
})

type AttemptResult = { outcome: DispatchOutcome; retryable: boolean }

type PostOptions = {
  timeoutMs: number
  deadline: AbortSignal
  deadlineMs: number
  retries: number
  retryDelayMs: number
  deliveryId: string
}

/** Hosts that only this machine can reach. Plain http to them never leaves the host. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * https everywhere. Plain http is allowed in development and test, and to loopback hosts in any
 * environment, so a local production build can reach a local receiver. Other http targets are refused.
 */
const isAllowedUrl = (url: string): boolean => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  if (parsed.protocol !== 'http:') return false
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return true
  return LOOPBACK_HOSTS.has(parsed.hostname)
}

/** Rejects as soon as the deadline passes, even when `fetch` ignores its abort signal. */
const untilDeadline = <T>(work: Promise<T>, deadline: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      reject(new Error('dispatch deadline exceeded'))
    }
    if (deadline.aborted) onAbort()
    else deadline.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => {
        deadline.removeEventListener('abort', onAbort)
        if (settled) return
        settled = true
        resolve(value)
      },
      (error) => {
        deadline.removeEventListener('abort', onAbort)
        if (settled) return
        settled = true
        reject(error)
      },
    )
  })

/** Waits before a retry; returns early when the deadline passes. */
const pause = (ms: number, deadline: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    deadline.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })

const deadlineFailure = (deadlineMs: number): AttemptResult => ({
  retryable: false,
  outcome: {
    status: 'failed',
    error: createDispatchError(
      'HTTP_DISPATCH_ERROR',
      `dispatch deadline of ${deadlineMs} ms exceeded`,
    ),
  },
})

const attemptPost = async (
  target: RevalidationTarget,
  event: CacheEvent,
  options: PostOptions,
): Promise<AttemptResult> => {
  if (options.deadline.aborted) {
    return deadlineFailure(options.deadlineMs)
  }
  if (!isAllowedUrl(target.url)) {
    return {
      retryable: false,
      outcome: {
        status: 'failed',
        error: createDispatchError('HTTP_DISPATCH_ERROR', 'target URL must use https'),
      },
    }
  }
  const controller = new AbortController()
  const abortWithDeadline = () => controller.abort()
  options.deadline.addEventListener('abort', abortWithDeadline, { once: true })
  if (options.deadline.aborted) abortWithDeadline()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const response = await untilDeadline(
      fetch(target.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.secret}`,
          'Content-Type': 'application/json',
          'X-Revalidation-Delivery': options.deliveryId,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
        // The Authorization header must never reach a redirect target, so redirects are not followed.
        redirect: 'manual',
      }),
      options.deadline,
    )

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      return {
        retryable: false,
        outcome: {
          status: 'failed',
          error: createDispatchError(
            'HTTP_DISPATCH_ERROR',
            `redirect refused (HTTP ${response.status})`,
          ),
        },
      }
    }
    if (!response.ok) {
      // Release the connection before any retry.
      await response.body?.cancel().catch(() => undefined)
      return {
        retryable: response.status >= 500 || response.status === 429,
        outcome: {
          status: 'failed',
          error: createDispatchError('HTTP_DISPATCH_ERROR', `HTTP ${response.status}`),
        },
      }
    }
    return { retryable: false, outcome: { status: 'accepted' } }
  } catch (error) {
    if (options.deadline.aborted) return deadlineFailure(options.deadlineMs)
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        retryable: true,
        outcome: {
          status: 'failed',
          error: createDispatchError('HTTP_DISPATCH_ERROR', 'HTTP dispatch timed out'),
        },
      }
    }
    return {
      retryable: true,
      outcome: {
        status: 'failed',
        error: createDispatchError('HTTP_DISPATCH_ERROR', 'HTTP dispatch failed'),
      },
    }
  } finally {
    clearTimeout(timer)
    options.deadline.removeEventListener('abort', abortWithDeadline)
  }
}

/**
 * Bounded retries for transport errors, timeouts, 429 and 5xx, within the dispatch deadline. Every
 * attempt carries the same `X-Revalidation-Delivery` id so the receiver can recognise repeats. Other
 * 4xx responses and redirects are final.
 */
const postEvent = async (
  target: RevalidationTarget,
  event: CacheEvent,
  options: PostOptions,
): Promise<DispatchOutcome> => {
  const attempts = options.retries + 1
  let last: AttemptResult | undefined
  let made = 0

  while (made < attempts) {
    if (made > 0) {
      // Full jitter: a random wait up to the doubling bound, so retries do not synchronise.
      await pause(Math.random() * options.retryDelayMs * 2 ** (made - 1), options.deadline)
      if (options.deadline.aborted) {
        last = deadlineFailure(options.deadlineMs)
        break
      }
    }
    made += 1
    last = await attemptPost(target, event, options)
    if (last.outcome.status === 'accepted' || !last.retryable) break
  }

  const outcome = last?.outcome ?? {
    status: 'failed' as const,
    error: createDispatchError('HTTP_DISPATCH_ERROR', 'no attempt made'),
  }
  if (outcome.status === 'accepted') return outcome
  const attemptsMade = made
  return {
    ...outcome,
    error: {
      ...outcome.error,
      message: `${outcome.error.message} (attempts: ${attemptsMade}/${attempts})`,
    },
  }
}

export const http = (config: HttpDispatcherConfig = {}): Dispatcher => {
  const factoryTarget = config.target
  const timeoutMs = config.timeoutMs ?? 15_000
  const deadlineMs = config.deadlineMs ?? 5_000
  const retries = config.retries ?? 2
  const retryDelayMs = config.retryDelayMs ?? 200

  return {
    async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
      const targets = resolveRevalidationTargets(factoryTarget)
      if (!targets.length) return missingTargetOutcome()

      const baseDeliveryId = input.deduplicationId ?? crypto.randomUUID()
      // One deadline spans every target, event and retry of this call.
      const deadline = new AbortController()
      const timer = setTimeout(() => deadline.abort(), deadlineMs)
      try {
        const outcomes: DispatchOutcome[] = []
        let eventIndex = 0
        let targetIndex = 0
        while (eventIndex < input.events.length) {
          const jobs: Array<() => Promise<DispatchOutcome>> = []
          while (jobs.length < MAX_CONCURRENT_DELIVERIES && eventIndex < input.events.length) {
            const target = targets[targetIndex]!
            const event = input.events[eventIndex]!
            const deliveryIndex = eventIndex
            jobs.push(() =>
              postEvent(target, event, {
                timeoutMs,
                deadline: deadline.signal,
                deadlineMs,
                retries,
                retryDelayMs,
                deliveryId: `${baseDeliveryId}:${deliveryIndex}`,
              }),
            )
            targetIndex += 1
            if (targetIndex === targets.length) {
              targetIndex = 0
              eventIndex += 1
            }
          }
          outcomes.push(...(await Promise.all(jobs.map((job) => job()))))
        }
        return aggregateDispatchOutcomes(outcomes, 'HTTP_DISPATCH_ERROR')
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
