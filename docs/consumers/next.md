# Next.js consumer

The Next.js consumer turns resolved event keys into declarative cache invalidation. It does not depend on Payload; any producer can send a compatible event.

Requires `next >=16.4.5 <17`. Cached functions use [Cache Components](https://nextjs.org/docs/app/getting-started/cache-components).

## Configuration

Declare tags and paths, require an explicit `resolve` callback, then define rules using the generated helpers:

```ts
// src/revalidation.ts
import 'server-only';
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags, paths, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  mode: 'expire',
  tags: { page: '[locale]:page:[slug]' },
  paths: { page: '/[locale]/[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  rules: ({ tags, paths }) => ({
    pages: { tags: [tags.page], paths: [paths.page] },
  }),
});
```

Configure Cache Components in `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = { cacheComponents: true };
export default nextConfig;
```

`defineRevalidation` compiles the configuration once and returns a `POST` function bound to it. It uses no shared configuration registry. Each call creates an independent handler; keep the configuration module server-only because it contains the secret and imports the Next.js consumer.

## Route Handler

Re-export the bound handler from a Route Handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation';
```

The handler accepts only `POST`, checks `Authorization: Bearer <secret>`, then validates and processes the event. The local configuration module must exist in the server bundle; there is no import-order or registry setup.

## Typed cache tags and paths

Use the generated helpers in cached server functions:

```ts
// src/lib/pages.ts
import { cacheTag } from 'next/cache';
import { paths, tags } from '@/revalidation';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
  // Load the page.
}
```

The helper arguments are inferred from the `[name]` placeholders. Static templates return no-argument helpers. `paths` uses the same typing and parameter rules.

## Rules

Read a rule as: “When this key is resolved, invalidate these targets.”

```ts
rules: ({ tags, paths }) => ({
  'home-page': { tags: [tags.home], paths: [paths.home] },
  projects: {
    tags: [tags.project, tags.projects],
    paths: [paths.project],
    mode: 'stale',
  },
  'site-settings': [tags.settings],
})
```

The rule key is the string returned by `resolve`. A rule can use the shorthand tag array or an object with `tags`, `paths`, and `mode`. The callback receives both helper maps, even when one map is empty.

## Event resolution

Resolution stays explicit because producers use different event shapes, identifiers, and key conventions. The callback receives each event item with flattened wire fields such as `key`, `collection`, `global`, `locale`, `slug`, `documentId`, and `operation`. Producer-specific data remains available through `event.item` and `event.raw`.

Resolve an existing key directly:

```ts
resolve: (event) => event.key ?? invalidKey()
```

Map producer-specific fields to application rule keys, and choose separate keys for updates and deletes:

```ts
resolve: (event) => {
  if (event.global === 'site-settings') return 'site-settings';
  if (event.collection === 'portfolioEntries') {
    return event.operation === 'delete' ? 'project-deleted' : 'projects';
  }
  return invalidKey();
}
```

`invalidKey()` throws a sentinel the consumer treats as a skipped item. It does not turn an invalid event into a cache key. A returned key with no matching rule is also skipped; the request can still return `200`. Other resolver exceptions return `500`.

## Custom parameters

The consumer first finds template parameters by name in the flattened event and item. Use `params` to rename or derive them:

```ts
params: (event) => ({
  locale: event.locale,
  projectSlug: event.slug,
})
```

For a template such as `'[locale]:project:[projectSlug]'`, the rule renders from the event's `locale` and the custom `projectSlug`. A missing parameter skips that target and is logged when a logger is configured.

## Revalidation modes

The global `mode` defaults to `expire`. A rule object's `mode` overrides it for that rule's tags.

| Mode | Next.js call | Behavior |
| --- | --- | --- |
| `expire` | `revalidateTag(tag, { expire: 0 })` | Expires immediately; the next read blocks while Next.js regenerates the entry. It does not eagerly regenerate it. |
| `stale` | `revalidateTag(tag, 'max')` | Marks the entry stale; the next read may serve stale data while Next.js refreshes it in the background. |

`stale` affects tag invalidation only. Paths use `revalidatePath(path)` without a profile; in a Route Handler, Next.js marks the path for revalidation on its next visit. An open page is not pushed a refresh.

## Custom cache layers

The simple form implies the `next` layer. Use `rules.layers` and `execute` to add cache layers such as a CDN:

```ts
rules: {
  layers: {
    next: ({ tags }) => ({ pages: [tags.page] }),
    cdn: ({ tags }) => ({ pages: [tags.page] }),
  },
},
execute: {
  cdn: async ({ tags, requestId }) => {
    // Purge the CDN entries for these tags.
  },
},
```

The `next` layer uses Next.js automatically. Every other layer needs an `execute` handler. If one fails, other layers still run and the request returns `500`.

## Validation and responses

- The `Authorization` header must be `Bearer <secret>`; otherwise the handler returns `401`.
- The comparison is constant-time. Anything else gets `401`.
- Request bodies are limited to 256 KiB by default (`maxBodyBytes`), with a hard maximum of 16 MiB. Oversized bodies return `400`.
- The handler counts streamed bytes and starts cancellation after the limit; it does not wait for the stream's cancellation promise before returning `400`. The framework owns transport cleanup.
- Events contain at most 100 items by default (`maxEvents`), with a hard maximum of 1000. Larger events return `400`.
- `maxEvents` must be at least the producer's chunk size (`maxEventItems` on the HTTP dispatcher, default 100). A larger chunk gets `400`.
- In the source DSL, each item is validated against its source schema. Invalid items are skipped; an unknown source returns `400`.
- In the simple `rules` form, the consumer accepts any source name and checks only that each item is an object. Use a source schema when event data needs runtime validation.
- Items with invalid or unmatched keys are skipped. A `200` response means the request was accepted, not that every cache target was invalidated.
- Limit values must be integers from 1 through their hard maximum; invalid configuration throws before the app starts.

See [security](../security.md) and [reliability](../reliability.md) for limits and delivery behavior.
