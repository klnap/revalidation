/**
 * Maximum number of items in one revalidation event. Consumers reject larger events with HTTP 400,
 * so the producer splits larger change sets into several events of at most this many items.
 * The consumer default uses the same value; hosts that lower their consumer limit must also lower
 * `REVALIDATION_EVENT_ITEM_LIMIT` in their own producer configuration, or chunks will be rejected.
 */
export const DEFAULT_MAX_EVENT_ITEMS = 100
