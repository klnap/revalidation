# Reliability

Revalidation has three stages, and only the first two are observable by this package:

1. **Accepted.** The consumer received the event, validated it, and returned `2xx`. The producer's dispatcher reports `accepted`.
2. **Executed.** The consumer ran each layer for the matched rules: `revalidateTag`, `revalidatePath`, or your `execute` handler.
3. **Fresh.** The next read of a cached entry returns current content. This depends on Next.js, on your cache lifetimes, and on when the entry is read. It is not measured by this package.

An accepted event does not guarantee that every layer ran; a layer can fail and the request returns `500` (the others still run). A successful layer does not guarantee fresh content for every reader.

## Delivery

- Delivery is best-effort. The HTTP dispatcher retries transport errors, timeouts, `429` and `5xx` responses within a deadline (see [HTTP dispatcher](dispatchers/http.md)). After that, the event is logged as failed and dropped.
- There is no persistent queue. A pending dispatch is held in memory. If the process exits or is frozen before dispatch runs, the event is lost.
- If the consumer is unavailable for longer than the retry deadline, every event in that window is lost. Cache entries stay stale until their next change or their cache lifetime ends.

Set a cache lifetime (`cacheLife` in Next.js) on cached data, so stale entries are bounded even when an event is lost.

## Timing

- The Payload producer dispatches after the save hook returns, one second later. It does not wait for the database transaction to commit.
- If a save is rolled back after its hook ran, the event is still sent. The consumer then revalidates tags for content that was not saved. This is harmless but unnecessary.
- Orderable reorders are the exception: they are sent after commit and dropped on rollback.

## Duplicates and order

- A retry can deliver an event that the consumer already processed. A fallback dispatcher can resend events.
- The consumer does not read content from events. It expires tags and paths, and the next read fetches the current content. A late or repeated event therefore only expires an entry that is refreshed on the next read.
- Repeated events cost a refresh, not correctness.

## Errors

| Where | Behavior |
| --- | --- |
| Read error while building an event | Logged; the save succeeds. Media resolution dispatches completed dependents and logs failed scopes; other producer read failures can lose the whole revalidation. |
| Dispatch failure after retries, or a non-accepted outcome | Logged; the save succeeds; the event is lost. |
| Item fails validation, or has no matching rule | Skipped and logged (when a logger is configured); the request succeeds. |
| A tag or path has a missing parameter | Skipped and logged as `missing_param`; the rest of the item still runs. |
| A layer fails | Logged; the other layers run; the request returns `500`. |
| `resolve` throws | The request returns `500`. |

## Limits of this model

- No delivery guarantee across restarts or outages.
- No ordering guarantee between events.
- No confirmation that a cache entry was regenerated.
- The producer does not block a save on revalidation.
