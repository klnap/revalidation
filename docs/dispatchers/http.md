# HTTP dispatcher

The HTTP dispatcher delivers events from a producer to a consumer over HTTP. It is one transport. The producer's dispatcher is any object with a `dispatch` method; the HTTP dispatcher is the built-in implementation.

```ts
import { http } from '@klnap/revalidation/dispatchers/http';
import { revalidation } from '@klnap/revalidation/producers/payload';

revalidation({
  dispatcher: http({
    target: { url: process.env.REVALIDATION_URL!, secret: process.env.REVALIDATION_SECRET! },
    timeoutMs: 15_000,
    deadlineMs: 5_000,
    retries: 2,
    retryDelayMs: 200,
    allowInsecure: false,
    maxEventItems: 100,
  }),
});
```

The values above are the defaults. Give `http()` one target or an array of targets; each dispatcher owns its targets.

## Request

Each event is one request:

```http
POST /api/revalidate HTTP/1.1
Authorization: Bearer <secret>
Content-Type: application/json
X-Revalidation-Delivery: <delivery id>:<event index>

{"source":"payload","data":[...]}
```

- The delivery id is the `deduplicationId` of the dispatch call when one is given, otherwise a random UUID per dispatch call. Every target and every retry of one event carries the same id. The producer does not set `deduplicationId`, so each dispatch call gets a new UUID, and each event in it is suffixed with its index.
- The consumer does not use the header to skip repeats; it is for logs and for custom receivers.

## Responses and failures

| Response | Result |
| --- | --- |
| `2xx` | Accepted. |
| `429`, `5xx` | Retryable. |
| Transport error, timeout | Retryable. |
| Other `4xx` | Terminal: `failed`, no retry. |
| `3xx` | Terminal: `failed`, no retry. Redirects are not followed. |

Retries: up to `retries` extra attempts (default 2, so three attempts in total). Each retry waits a random time up to double the previous bound, starting from `retryDelayMs`.

## Chunk size

`maxEventItems` (default 100, hardest allowed 1000) is the most items the producer puts in one event. A larger change set is split into several events, each sent as its own request. Keep it at or below the consumer's `maxEvents`.

## Timeouts and deadline

- `timeoutMs` limits one attempt.
- `deadlineMs` limits the whole dispatch call: all events, all targets, and all retries. In practice it caps the timeout, because it is usually shorter.
- A bulk change set becomes several requests. Raise `deadlineMs` when a large publish sends many events, or those events can fail together at the deadline.

When the deadline passes, the dispatch fails even if the request is still open.

## Concurrency

Deliveries run in batches of up to four. A batch waits for its slowest delivery before the next batch starts.

## Transport security

The URL must use HTTPS. Plain `http://` is allowed in these cases:

- `NODE_ENV` is exactly `development` or `test`.
- The host is loopback: `localhost`, `127.0.0.1`, or `[::1]`. Such traffic never leaves the machine.
- `allowInsecure: true` is set. Any host then accepts plain http, and the bearer secret travels unencrypted. Use it only on a network you trust.

## Duplicate delivery

A retry after a timeout can reach a consumer that already processed the first attempt. A fallback dispatcher (see below) can also resend the same events. Invalidating a tag twice has the same result as once, so the built-in consumer is not harmed by repeats. Custom consumers must tolerate repeated events.

## Fallback dispatcher

`revalidation({ dispatcher: { default, fallback } })` sends to `default` first. `fallback` is used only when `default` throws or reports `failed` (not for `rejected` or `unknown`), and receives the same events again.

## Outcomes

`http()` reports `accepted` or `failed`. `accepted` means the consumer accepted the event; it does not mean every cache layer was refreshed. See [reliability](../reliability.md).

## Custom dispatchers

A dispatcher is an object with `dispatch({ events, deduplicationId? })`, returning `{ status: 'accepted' | 'rejected' | 'failed' | 'unknown', ... }`. The `Dispatcher` type is exported from `@klnap/revalidation`. The plugin accepts any object of this shape. See [extending](../extending.md).
