# Reliability

Revalidation has separate stages: a producer creates an event, a dispatcher delivers it, the consumer validates and matches it, and the cache API performs invalidation. Success at one stage does not guarantee success at the next.

## Delivery

- Delivery is best-effort. The HTTP dispatcher retries transport errors, timeouts, `429`, and `5xx` responses within a deadline. Other non-`2xx` responses are terminal. See [HTTP dispatcher](dispatchers/http.md).
- There is no persistent queue. A pending dispatch is held in memory and can be lost if the process exits or freezes before it runs.
- If the consumer stays unavailable beyond the retry deadline, those events are dropped. No background retry recovers them.
- A consumer `200` means validation and cache API calls completed. Invalid events or source data reject the request.

## Payload timing

Payload lifecycle hooks run before the database transaction commits. Deferred dispatch reduces the
chance of racing the write, but does not prove commit ordering. An event may be sent for a write
that later rolls back. The orderable integration uses callbacks supplied by the host; do not assume
they run after commit or observe rollback unless the host integration proves it.

Dispatch failures and event-building read errors are logged without rejecting the Payload save. A read error can lose some or all of that revalidation. Media dependency resolution keeps and dispatches dependents it resolved before a query failure, but does not retry failed scopes.

## Cache behavior

The consumer invalidates tags and paths; it does not read content or force pages open in browsers to refresh. With the default `expire` mode, the next read of an invalidated tag waits for regeneration. With `stale`, Next.js may serve stale data while regenerating. See [consumer modes](consumers/next.md#rules-and-selectors).

Cache expiration and stale-while-revalidate are separate from event delivery. A cache lifetime can bound how long data remains cached under the framework's normal behavior, but it does not recover a lost event or prove that the underlying data source is current.

## Duplicates, order, and failures

- A timeout retry or fallback dispatcher can deliver the same event more than once. The built-in invalidation is repeatable; custom consumers must tolerate duplicates.
- Events have no ordering guarantee. The consumer invalidates tags and paths, so a late event can trigger another read of current content.
- Invalid CloudEvents or source data reject the full request before cache operations. A matched rule
  can return no tags or paths; it does not invalidate anything.
- A cache API failure returns `500`. The dispatcher may retry the event.
- A thrown rule callback returns `500`.

There is no guarantee of delivery across restarts or outages, rule execution for skipped items, successful invalidation by every cache layer, or regenerated/fresh data.
