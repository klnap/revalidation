# Custom event sources

A source is the CloudEvents `source` URI and its Standard Schema V1 validator for event `data`.
Register each accepted source in `defineRevalidation()`. Envelope validation is package-owned;
source schemas validate only application data.

```ts
import * as v from 'valibot'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

const source = 'https://billing.example/events'
const schema = v.object({
  operation: v.picklist(['create', 'update', 'delete']),
  key: v.string(),
})

export const { POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  sources: { [source]: schema },
  tags: { pricing: 'pricing' },
  rules: ({ tags, on }) => [
    on({ source, type: 'com.example.pricing.changed.v1' }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
  ],
})
```

Send a CloudEvent in structured JSON format, signed with Standard Webhooks. The event's `source`
must match a registered schema; its `data` must satisfy that schema. Validation is awaited, including
for asynchronous Standard Schema implementations, and the validated output is passed to rules.

Add a schema library such as Valibot as a direct dependency when your application imports it. See
[the Next.js consumer](../consumers/next.md) for route setup and request behavior.
