/**
 * Maximum number of items in one revalidation event. Consumers reject larger events with HTTP 400,
 * so the producer splits larger change sets into several events of at most this many items.
 * The consumer default uses the same value; a host that lowers its consumer limit must also lower
 * this producer limit, or chunks will be rejected.
 */
export const DEFAULT_MAX_EVENT_ITEMS = 100
