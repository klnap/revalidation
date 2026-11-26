# `@klnap/revalidation`

Declarative, type-safe cache revalidation across independent producers and consumers. Connect
Payload CMS changes to Next.js cache invalidation through signed CloudEvents, or register your own
event source.

## Quick example

Configure a Next.js consumer to validate Payload events and map changed pages to typed cache tags
and paths:

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
      {
        source: payloadSource,
        affected: { type: 'payload.collection', name: 'pages' },
      },
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

## Why?

Next.js can invalidate its own cache, but a CMS or another service often owns the write. Connecting
those systems means agreeing on event data, authenticating delivery, validating input, and mapping
changed records to the right cache entries.

This package provides that boundary while leaving cache policy in your application. Use native
Next.js APIs directly when the producer and cache live in one application; use this package when
events cross a process or service boundary.

## Features

- Share CloudEvents 1.0 between independent producers and consumers.
- Validate each event source with Standard Schema V1 and preserve inferred data types in rules.
- Sign HTTP deliveries with Standard Webhooks and configure named, filtered targets.
- Opt Payload collections and globals into change events, including localized identifiers and media
  dependencies.
- Map events to typed Next.js cache tags and paths, or run application-owned cache operations.

## Installation

```bash
bun add @klnap/revalidation
```

```bash
npm install @klnap/revalidation
```

Next.js and Payload are optional peer dependencies. Install the integration you use in its
application; you do not need both.

## Usage

### Expose the Next.js Route Handler

Re-export the handler from an App Router Route Handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation'
```

Keep the configuration module server-side. The handler verifies the Standard Webhooks signature,
validates every event, and only then runs matching rules and cache operations.

### Send events from Payload

Add the dispatcher and plugin to your existing Payload configuration. Opt collections or globals in
with `custom.revalidation`:

```ts
import { http } from '@klnap/revalidation/dispatchers/http'
import { revalidation } from '@klnap/revalidation/producers/payload'

const revalidationPlugin = revalidation({
  dispatcher: http({
    targets: {
      website: {
        url: process.env.REVALIDATION_URL!,
        secret: process.env.REVALIDATION_SECRET!,
      },
    },
  }),
})

const pages = {
  slug: 'pages',
  custom: { revalidation: true },
  fields: [{ name: 'title', type: 'text' }],
}
```

Add `revalidationPlugin` under `plugins` and `pages` under `collections` in your existing
`buildConfig()` options.

Use the same `whsec_` secret in both applications. `true` uses the collection's `slug` as its route
identifier; set `identifier` to a field path when your route uses another value.

### Tag cached Next.js data

`cacheTag` with the `'use cache'` directive requires `cacheComponents: true` in `next.config.ts`.
Then use the helper from the consumer configuration:

```ts
import { cacheTag } from 'next/cache.js'
import { tags } from '@/revalidation'

export async function getPage(locale: string, slug: string) {
  'use cache'
  cacheTag(tags.page({ locale, slug }))
  return fetch(
    `https://cms.example/api/pages/${encodeURIComponent(locale)}/${encodeURIComponent(slug)}`,
  ).then((response) => response.json())
}
```

### Use another event source

Register a Standard Schema validator for each CloudEvents `source`. Add the schema library you
import as a direct dependency:

```ts
import 'server-only'
import * as v from 'valibot'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

const source = 'https://billing.example/events'
const schema = v.object({ key: v.string() })

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

See [custom event sources](./docs/sources/custom.md) for the event format and schema behavior.
For custom cache work, use named `execute` callbacks; see the [Next.js consumer guide](./docs/consumers/next.md).

## Configuration

### Next.js consumer

`defineRevalidation()` requires a secret, source schemas, and rules. Cache templates are optional.

| Option | Default | Behavior |
| --- | --- | --- |
| `secret` | Required | Standard Webhooks secret used to verify requests. |
| `sources` | Required | Map of CloudEvents source URIs to Standard Schema V1 validators. |
| `rules` | Required | Match events with `on(selector, resolver)` or resource mappings. All matching rules run. |
| `tags`, `paths` | `{}` | Named templates create helpers; each `[parameter]` becomes a required string argument. |
| `mode` | `expire` | `expire` maps to `{ expire: 0 }`; `stale` maps to Next.js `"max"`. |
| `maxBodyBytes` | 256 KiB | Request limit; hard ceiling 16 MiB. |
| `bodyTimeoutMs` | 15 seconds | Body-read deadline; hard ceiling 60 seconds. |
| `maxEvents` | 100 | Events accepted per request; hard ceiling 1,000. |
| `maxOperations` | 1,000 | Custom operations per request; hard ceiling 10,000. |
| `executionTimeoutMs` | 15 seconds | Custom executor deadline; hard ceiling 60 seconds. |

Rule and individual tag results can override `mode`. They accept `expire`, `stale`, or a native
Next.js profile (`string` or `{ expire?: number }`). Path results accept `type: 'page' | 'layout'`;
dynamic paths default to `page`. Tags are limited to 256 characters and paths to 1,024 characters.
Template parameters are not escaped; validate values before using untrusted input in cache keys.

Custom `execute` callbacks run synchronously within the request, in rule order. They receive an
`AbortSignal`, but cancellation is cooperative. This is not a background queue.

### HTTP dispatcher

`http()` requires at least one named target. Each target has a URL and a `whsec_` secret; an optional
`filter` selects matching CloudEvents. Targets must use HTTPS, except loopback HTTP or an explicit
`allowInsecure: true`.

| Option | Default | Hard ceiling |
| --- | --- | --- |
| `timeoutMs` | 15 seconds per attempt | 60 seconds |
| `deadlineMs` | 5 seconds per dispatch | 300 seconds |
| `retries` | 2 additional attempts | 10 |
| `retryDelayMs` | 200 ms | 60 seconds |
| `maxEventItems` | 100 per request | 1,000 |
| `maxBodyBytes` | 256 KiB per request | 16 MiB |
| `allowInsecure` | `false` | `true` permits non-loopback HTTP; avoid it in production. |

The dispatcher retries network errors, timeouts, `429`, and `5xx` responses within the deadline.
Other `4xx` responses and redirects are terminal. It has no persistent queue.

### Payload producer

The plugin requires a `dispatcher`. Its `source` defaults to
`urn:klnap:revalidation:payload`; `enabled` defaults to `true`. If `media` is omitted, the plugin
selects the only upload collection or an upload collection with the slug `media`.

Collections and globals are disabled until `custom.revalidation` is set:

| Setting | Default and behavior |
| --- | --- |
| `true` | Collection: `afterChange` and `afterDelete`; global: `afterChange`. |
| `enabled` | `true` when an options object is used; `false` opts out. |
| `hooks` | Both collection hooks; globals support `afterChange` only. |
| `identifier` | Collection `slug`; accepts one field path or independent field paths. |
| `excludeFields` | No extra exclusions; ignores selected fields during change detection. |
| `orderField` | Payload `_order` for orderable collections; configurable for other schemas. |

The plugin also accepts top-level `excludeFields`, per-collection and per-global exclusions, and a
custom media collection. See the [Payload producer guide](./docs/producers/payload.md) for precedence
and localization behavior.

## Compatibility

- Node.js `^22.23.5 || ^24.22.3 || >=26.13.1`.
- TypeScript 5.0 or later; public types use `const` type parameters.
- Next.js `>=16.4.5 <17` for the Next.js consumer.
- Payload `>=3.94.1 <4` for the Payload producer.

Next.js and Payload are optional peers, so other producers can use the event and HTTP contracts
without installing either framework. The consumer accepts signed CloudEvents structured JSON and
JSON batches.

Delivery is best-effort: bounded retries can duplicate events, and process exit or prolonged outages
can lose them. Payload hooks run before the database transaction commits; a later rollback cannot
retract an event already delivered.

## Documentation

- [Architecture](./docs/concepts/architecture.md)
- [Payload producer](./docs/producers/payload.md)
- [HTTP dispatcher](./docs/dispatchers/http.md)
- [Next.js consumer](./docs/consumers/next.md)
- [Custom event sources](./docs/sources/custom.md)
- [Reliability](./docs/reliability.md)
- [Security](./docs/security.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Extension points](./docs/extending.md)
- [0.3.0 to 0.4.0 migration](./docs/migration/0.3.0-to-0.4.0.md)

## License

[MIT](./LICENSE)
