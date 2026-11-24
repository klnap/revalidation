/**
 * Maximum number of items in one revalidation event. Consumers reject larger events with HTTP 400,
 * so the producer splits larger change sets into several events of at most this many items.
 * The consumer default uses the same value; a host that lowers its consumer limit must also lower
 * this producer limit, or chunks will be rejected.
 */
export const DEFAULT_MAX_EVENT_ITEMS = 100

/** Hardest upper bound for items per event. Configuration above it is rejected at startup. */
export const MAX_EVENT_ITEMS_CEILING = 1000

/** Request body size the consumer reads by default. */
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024

/** Hardest upper bound for the request body size. Configuration above it is rejected at startup. */
export const MAX_BODY_BYTES_CEILING = 16 * 1024 * 1024

/** Returns `value` when it is an integer from 1 to `ceiling`; otherwise throws a configuration error. */
export const assertLimit = (name: string, value: number, ceiling: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > ceiling) {
    throw new RangeError(`${name} must be an integer from 1 to ${ceiling}; got ${value}`)
  }
  return value
}
