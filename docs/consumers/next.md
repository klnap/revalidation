# Next.js consumer

The Next.js consumer authenticates signed deliveries, validates the full event batch, maps changed
resources to cache operations, and then runs the operations. It does not require Payload or any
source/schema registry for the built-in resource-change event.

Requires Next.js `>=16.4.5 <17`. Keep the secret-bearing configuration in a server-only module.

## Configure the handler

```ts
// src/revalidation.ts
import 'server-only'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

export const { tags, paths, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,

  tags: {
    pages: '[locale]:pages',
    page: '[locale]:page:[slug]',
  },

  paths: {
    page: '/[locale]/[slug]',
  },

  rules: ({ tags, paths }) => ({
    'payload.collection.pages': {
      tags: [tags.pages, tags.page],
      paths: [paths.page],
    },
  }),
})
```

Re-export the bound handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation'
```

The built-in `com.klnap.revalidation.resource.changed.v1` schema is selected by event `type`.
Schema registration is only needed for additional event contracts. `source` identifies a producer;
`allowedSources` optionally restricts accepted identities. These are separate from webhook
authentication, which uses `secret`.

## Templates and automatic mapping

Template placeholders become required parameters in application code:

```ts
tags.page({ locale: 'pl', slug: 'about' }) // "pl:page:about"
paths.page({ locale: 'pl', slug: 'about' }) // "/pl/about"
```

The same typed helpers can be used as declarative rule references. The consumer resolves parameters
from each validated affected resource, including `locale`, `slug`, `id`, and configured
`identifiers`. Payload emits old and current resources when an identifier changes, so a mapping
invalidates both without a callback or loop. Equivalent cache operations are deduplicated.

Missing parameters do not produce partial success: that template operation is skipped, the request
returns an error, and a structured diagnostic is reported. Unsafe path values—including separators,
malformed percent escapes, dot segments, query delimiters, and fragment delimiters—fail validation.
Do not use untrusted values to construct arbitrary cache profiles or custom operation payloads.

For cached functions using `'use cache'` and `cacheTag`, enable `cacheComponents: true` in
`next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = { cacheComponents: true }
export default nextConfig
```

```ts
import { cacheTag } from 'next/cache'
import { tags } from '@/revalidation'
import { loadPage } from '@/data/pages'

export async function getPage(locale: string, slug: string) {
  'use cache'
  cacheTag(tags.page({ locale, slug }))
  return loadPage(locale, slug)
}
```

`loadPage()` is application-owned. The package does not wrap or replace native Next.js caching.
See the Next.js [`cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag) and
[`revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) references.

## Rules and selectors

Group resources with one invalidation policy using an array of mappings:

```ts
rules: ({ tags, on }) => [
  {
    'payload.collection.pages': [tags.pages, tags.page],
  },
  on(
    ['payload.collection.projects', 'payload.collection.categories'],
    [tags.homepage],
  ),
]
```

Use structured selectors and resolver callbacks for source/type/operation conditions or
application-specific decisions. Rules can return tag and path operations, native cache profiles,
and named custom operations. Use `[tag, profile]` to override a profile for one tag and `[path, type]`
to invalidate a literal dynamic route pattern. Profiles inherit from the tuple, rule, then
configuration; tags default to `{ expire: 0 }`. Conflicting profiles for one tag reject the request
before any custom or Next.js operation runs.

## Custom event types

Register additional Standard Schema V1 validators by CloudEvents `type`. The validated schema
output is inferred by the matching `on({ type }, resolver)` callback:

```ts
import * as v from 'valibot'

const type = 'com.example.pricing.changed.v1'
const schema = v.object({ key: v.string() })

defineRevalidation({
  secret,
  schemas: { [type]: schema },
  tags: { pricing: 'pricing' },
  rules: ({ tags, on }) => [
    on({ type }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
  ],
})
```

Add `allowedSources` only when the consumer must restrict producer identities. A source allowlist
does not replace Standard Webhooks authentication.

## Custom cache operations

Use named `execute` callbacks when invalidation depends on application-owned work such as indexing.
The callback is awaited in the request lifecycle:

```ts
import { resourceChangedEventType } from '@klnap/revalidation'

defineRevalidation({
  secret,
  rules: ({ on }) => [
    on(
      { type: resourceChangedEventType, affected: { type: 'payload.collection', name: 'products' } },
      ({ affected }) => ({
        operations: [{
          layer: 'index',
          value: affected.flatMap(({ resource }) => resource.id ? [resource.id] : []),
        }],
        tags: ['products'],
      }),
    ),
  ],
  execute: {
    index: async ({ value, signal }) => updateProductIndex(value, { signal }),
  },
})
```

Custom operations run sequentially per rule before that rule's Next.js cache operations. Failure
skips dependent work while independent rules continue. Executors receive an `AbortSignal`, but
cancellation is cooperative: the deadline stops waiting and requests cancellation; it cannot force
stop work or undo external side effects. This is not a durable queue.

## Validation and limits

The handler accepts structured CloudEvents JSON and CloudEvents JSON batches. It authenticates the
request, parses the envelope, checks `allowedSources`, and validates every event before planning or
executing side effects.

| Limit | Default | Hard ceiling |
| --- | ---: | ---: |
| Request body | 256 KiB | 16 MiB |
| Body-read deadline | 15 seconds | 60 seconds |
| Events per request | 100 | 1,000 |
| Planned custom and cache operations | 1,000 | 10,000 |
| Custom operation deadline | 15 seconds | 60 seconds |

The operation limit bounds expanded tags, paths, and custom operations before any are executed.
The HTTP dispatcher has separate delivery limits; its total dispatch deadline includes the time
spent across attempts and retry delays, so per-attempt timeouts are not independent total-time
guarantees. See the [HTTP dispatcher](../dispatchers/http.md), [reliability](../reliability.md),
and [security](../security.md) references.

Cache profiles use Next.js-native profile strings or `{ expire: number }`; there are no `stale` or
`expire` aliases. Path strings and typed path references resolve concrete URLs. Use
`['/blog/[slug]', 'page']` or `['/blog/[slug]', 'layout']` for literal route patterns. Concrete
URLs are passed to `revalidatePath` without an inferred route type.
