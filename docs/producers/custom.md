# Custom producers

A producer creates CloudEvents when its system changes. It can use the built-in resource-change
contract with the HTTP dispatcher, or emit a custom event type for a different data contract.

## Emit a resource-change event

The built-in resource-change schema is available to every consumer. A custom producer does not need
to register it:

```ts
import { resourceChangedEventType, type CloudEvent } from '@klnap/revalidation'
import { http } from '@klnap/revalidation/dispatchers/http'

const dispatcher = http({
  targets: {
    website: {
      url: process.env.REVALIDATION_URL!,
      secret: process.env.REVALIDATION_SECRET!,
    },
  },
})

const event: CloudEvent = {
  specversion: '1.0',
  id: crypto.randomUUID(),
  source: 'https://commerce.example.com',
  type: resourceChangedEventType,
  datacontenttype: 'application/json',
  data: {
    operation: 'update',
    resource: { type: 'commerce.product', id: 'sku-1' },
    affected: [{
      operation: 'update',
      resource: { type: 'commerce.product', id: 'sku-1' },
    }],
  },
}

await dispatcher.dispatch({ events: [event] })
```

`source` must be a stable absolute URI identifying the producer. Keep `id` stable when retrying
the same event. `REVALIDATION_URL` and `REVALIDATION_SECRET` are server-only application
configuration.

## Emit a custom event type

Use a custom CloudEvents `type` when its `data` contract differs from resource changes. Register a
Standard Schema V1 validator for that type in the Next.js consumer:

```ts
import * as v from 'valibot'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

const type = 'com.example.pricing.changed.v1'

defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  schemas: {
    [type]: v.object({ key: v.string() }),
  },
  tags: {
    pricing: 'pricing',
  },
  rules: ({ tags, on }) => [
    on({ type }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
  ],
})
```

The schema validates `data`; the package validates the CloudEvents envelope. `type` selects the
schema, while `source` identifies the producer. `allowedSources` is an optional exact-match
allowlist, not authentication.

Custom producers that send HTTP requests outside the built-in HTTP dispatcher must send CloudEvents
structured JSON and sign the exact request body with Standard Webhooks. Add the schema library
used by your application as a direct dependency.

For the event fields, media types, batches, and validation limits, see the
[event contract](../concepts/event-contract.md). For another transport or delivery policy, see
[custom dispatchers](../dispatchers/custom.md).
