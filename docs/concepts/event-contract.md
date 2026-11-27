# Event contract

The framework-independent package root defines the event and dispatcher contracts. Built-in
Payload, HTTP, and Next.js integrations use these contracts; other systems can implement compatible
producers, dispatchers, or consumers without importing those integrations.

## CloudEvents

Events use CloudEvents 1.0 structured JSON. A single event uses
`application/cloudevents+json`; an ordered batch uses `application/cloudevents-batch+json`.
Events require `specversion`, `id`, `source`, `type`, and `data`. `source` must be an absolute URI.

The built-in resource-change type and schema are exported as `resourceChangedEventType` and
`resourceChangedSchema`. Its `data` shape is exported as `ResourceChangedData`. Use a different
CloudEvents `type` when the event data has a different contract, and validate its `data` with a
Standard Schema V1 schema.

Schema selection uses `type`, not `source`. A consumer may separately restrict accepted sources
with an exact-match `allowedSources` allowlist. Source allowlisting does not authenticate a sender.

## Dispatcher contract

The root export provides `CloudEvent`, `DispatchInput`, `DispatchOutcome`, and `Dispatcher`:

```ts
import type { Dispatcher } from '@klnap/revalidation'

type DispatchFunction = Dispatcher['dispatch']
```

`DispatchFunction` accepts `DispatchInput` and returns `Promise<DispatchOutcome>`.
`DispatchOutcome` reports `accepted`, `partial`, `rejected`, `failed`, or `unknown` status and
per-target results. Custom dispatchers own their transport guarantees and must report uncertainty
instead of claiming confirmed delivery. Each dispatcher owns its own batching policy.

## HTTP authentication

The built-in HTTP dispatcher signs each request with Standard Webhooks. The receiver must verify
the signature against the original raw request body before parsing or acting on it. The built-in
Next.js consumer performs this verification. A custom consumer must supply its own authentication
and request limits.

See the [custom producer guide](../producers/custom.md), [custom dispatcher guide](../dispatchers/custom.md),
and [custom consumer guide](../consumers/custom.md) for role-specific integration details.
