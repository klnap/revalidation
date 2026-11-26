# Next.js consumer

The Next.js consumer verifies Standard Webhooks signatures, validates CloudEvents and source data,
matches rules, then invalidates tags and paths. It does not depend on Payload.

Requires Next.js `>=16.4.5 <17`. Keep the secret-bearing configuration in a server-only module.

## Configure the handler

```ts
// src/revalidation.ts
import 'server-only'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { payloadSchema, payloadSource } from '@klnap/revalidation/sources/payload'

export const { tags, paths, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  sources: { [payloadSource]: payloadSchema },
  tags: { page: '[locale]:page:[slug]' },
  paths: { page: '/[locale]/[slug]' },
  rules: ({ tags, paths, on }) => [
    on(
      { source: payloadSource, affected: { type: 'payload.collection', name: 'pages' } },
      ({ affected }) => ({
        tags: affected.flatMap(({ resource }) =>
          resource.locale && resource.slug
            ? [tags.page({ locale: resource.locale, slug: resource.slug })]
            : [],
        ),
        paths: affected.flatMap(({ resource }) =>
          resource.locale && resource.slug
            ? [paths.page({ locale: resource.locale, slug: resource.slug })]
            : [],
        ),
      }),
    ),
  ],
})
```

Re-export the bound handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation'
```

`defineRevalidation()` binds one handler to its configuration. It uses no process-global registry.

## Typed cache templates

Template parameters in brackets become required helper arguments:

When using `cacheTag` with the `'use cache'` directive, enable `cacheComponents: true` in
`next.config.ts`. This is a Next.js requirement; the package does not change your Next.js config.

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = { cacheComponents: true }
export default nextConfig
```

```ts
import { cacheTag } from 'next/cache.js'
import { tags } from '@/revalidation'

export async function getPage(locale: string, slug: string) {
  'use cache'
  cacheTag(tags.page({ locale, slug }))
  // Load the page.
}
```

Static templates need no arguments. Values are not escaped; validate untrusted values before using
them as tag or path parameters. See the Next.js
[`cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag) reference.

## Rules and selectors

`on(selector, resolve)` selects CloudEvents by `source`, `type`, root operation/resource, or affected
resource. The callback receives the validated `event`, its `data`, root fields, all `affected`
resources, and typed `tags` and `paths`.

Return `tags`, `paths`, or both. A rule may also set `mode`; the top-level mode defaults to `expire`.
Tag results can override the mode individually. Path results may specify `type: 'page' | 'layout'`.
See the [Next.js cache API](https://nextjs.org/docs/app/api-reference/functions/revalidateTag).

## Custom cache work

Use `operations` and named `execute` callbacks for app-owned cache work. The handler runs operations
in order before Next.js tag or path invalidation:

```ts
defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  sources: { [payloadSource]: payloadSchema },
  rules: ({ on }) => [
    on(
      { source: payloadSource, affected: { type: 'payload.collection', name: 'products' } },
      ({ affected }) => ({
        operations: [
          {
            layer: 'search',
            value: affected.flatMap(({ resource }) => (resource.id ? [resource.id] : [])),
          },
        ],
        tags: affected.flatMap(({ resource }) =>
          resource.slug ? [`product:${resource.slug}`] : [],
        ),
      }),
    ),
  ],
  execute: {
    search: async ({ value, signal }) => {
      await updateSearchIndex(value, { signal })
    },
  },
})
```

Operations run sequentially within each matching rule. A failed operation skips later operations
and Next.js invalidations from that rule; independent rules continue. Any failure returns HTTP 500
with per-operation results. Executors receive an `AbortSignal`; the default execution deadline is
15 seconds, and `executionTimeoutMs` can set a value up to 60 seconds. Executors must honor the
signal to stop their own work. A timeout stops the handler waiting and sends an abort request; it
cannot forcibly terminate an executor that ignores the signal or reverse side effects already made.
Timed-out operations remain failures, later dependent operations stay skipped, and late executor
completion cannot resume invalidation. The handler limits requests to 1,000 custom operations by
default; `maxOperations` can raise this to 10,000. This is synchronous best-effort work, not a
durable queue.

## Validation and limits

The handler accepts structured CloudEvents JSON and CloudEvents JSON batches only. It verifies the
request signature before parsing events, checks each event against its source's Standard Schema V1
validator, and runs no cache operation until every event validates.

Unknown sources, invalid data, malformed events, and invalid signatures fail the request. The
default body limit is 256 KiB and the default event limit is 100. Configure `maxBodyBytes` and
`maxEvents` within the package's hard ceilings. Body reads have a 15-second default deadline;
`bodyTimeoutMs` can set a value up to 60 seconds.

See [security](../security.md) for request authentication, replay behavior, and limits.
