# HTTP dispatcher

The HTTP dispatcher sends CloudEvents to named destinations. It signs every request with Standard
Webhooks.

```ts
import { http } from '@klnap/revalidation/dispatchers/http'

const dispatcher = http({
  targets: {
    website: {
      url: process.env.REVALIDATION_URL!,
      secret: process.env.REVALIDATION_SECRET!,
      filter: { source: 'https://cms.example/payload' },
    },
    preview: {
      url: process.env.PREVIEW_REVALIDATION_URL!,
      secret: process.env.PREVIEW_REVALIDATION_SECRET!,
    },
  },
  timeoutMs: 15_000,
  deadlineMs: 5_000,
  retries: 2,
  retryDelayMs: 200,
  maxEventItems: 100,
  maxBodyBytes: 256 * 1024,
})
```

The `targets` record names delivery destinations. Target filters run before chunking. A manual
`targets` selection narrows the configured set; it does not bypass filters. Without an explicit
selection, matching events fan out to every configured target.

## Request format

A single event uses `application/cloudevents+json`. A batch uses
`application/cloudevents-batch+json`. Every request has `webhook-id`, `webhook-timestamp`, and
`webhook-signature` headers. Retries reuse the body and delivery ID, and create a fresh timestamp
and signature.

## Retries and outcomes

- `2xx`: accepted.
- `429` and `5xx`: retryable.
- Other `4xx` and redirects: terminal.
- Network errors and timeouts: retryable.

`retries` counts extra attempts. Backoff uses a random delay up to twice the previous bound.
`deadlineMs` bounds all targets, chunks, and retries in one dispatch. Deliveries run with bounded
concurrency. The default `timeoutMs` is 15 seconds per attempt, while the total dispatch deadline
defaults to 5 seconds. The shorter total deadline can abort an attempt before its per-attempt timeout;
these are nested bounds, not independent time guarantees.

`maxEventItems` bounds events per request. `maxBodyBytes` bounds encoded request bytes. The
dispatcher splits batches to satisfy both limits and reports an individually oversized event as a
failed target result without sending it.

## Transport security

Targets must use HTTPS unless `allowInsecure: true` or the URL uses loopback (`localhost`,
`127.0.0.1`, or `[::1]`). Do not enable insecure transport for a non-loopback host in production.
Target URLs cannot contain user-info credentials. Secrets must use the Standard Webhooks `whsec_`
encoding.

There is no persistent queue. Delivery failure is reported to the producer and is not recovered
after process exit. See [reliability](../reliability.md).
