# Reliability

Revalidation has separate stages: a producer creates an event, a dispatcher delivers it, the consumer validates and matches its items, and cache layers perform invalidation. Success at one stage does not guarantee success at the next.

## Delivery

- Delivery is best-effort. The HTTP dispatcher retries transport errors, timeouts, `429`, and `5xx` responses within a deadline. Other non-`2xx` responses are terminal. See [HTTP dispatcher](dispatchers/http.md).
- There is no persistent queue. A pending dispatch is held in memory and can be lost if the process exits or freezes before it runs.
- If the consumer stays unavailable beyond the retry deadline, those events are dropped. No background retry recovers them.
- A consumer `200` means the request was accepted. It can still contain skipped items whose source validation, key resolution, or rule matching failed.

## Payload timing

The Payload producer schedules dispatch about one second after a save hook returns. It does not wait for the database transaction to commit. If a save rolls back after its hook ran, the event can still be sent and invalidate tags for content that was not saved.

Built-in orderable hooks are different: they dispatch after commit and discard reorders on rollback.

Dispatch failures and event-building read errors are logged without rejecting the Payload save. A read error can lose some or all of that revalidation. Media dependency resolution keeps and dispatches dependents it resolved before a query failure, but does not retry failed scopes.

## Cache behavior

The consumer invalidates tags and paths; it does not read content or force pages open in browsers to refresh. With the default `expire` mode, the next read of an invalidated tag waits for regeneration. With `stale`, Next.js may serve stale data while regenerating. See [consumer modes](consumers/next.md#modes).

Cache expiration and stale-while-revalidate are separate from event delivery. A cache lifetime can bound how long data remains cached under the framework's normal behavior, but it does not recover a lost event or prove that the underlying data source is current.

## Duplicates, order, and failures

- A timeout retry or fallback dispatcher can deliver the same event more than once. The built-in invalidation is repeatable; custom consumers must tolerate duplicates.
- Events have no ordering guarantee. The consumer invalidates tags and paths, so a late event can trigger another read of current content.
- Items rejected by a source schema, with an invalid or unmatched key, or missing a required template parameter can be skipped. Skipped items do not make the whole request fail.
- A layer failure returns `500`; other configured layers still run. The dispatcher may retry the event.
- A thrown `resolve` callback returns `500`.

There is no guarantee of delivery across restarts or outages, rule execution for skipped items, successful invalidation by every cache layer, or regenerated/fresh data.
