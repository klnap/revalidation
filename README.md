# @klnap/revalidation

Event-driven cache revalidation for Next.js. Invalidate cache tags and paths automatically when content changes in Payload CMS, or send events from any other system to the same protected route.

```
Payload CMS ──▶ HTTP dispatcher ──▶ Next.js route ──▶ revalidateTag / revalidatePath
(producer)       (transport)         (consumer)
```

## Why

Next.js gives you `revalidateTag` and `revalidatePath`. Connecting them to content changes is up to you: hooks in the CMS, an authenticated endpoint, a mapping from documents to cache tags, and handling for locales and shared media. This package provides those parts, so a content change expires exactly the cache entries that depend on it.

It separates the three concerns, so you can use only what you need: the Next.js consumer works on its own, the Payload producer adds automatic events, and the dispatcher is the transport between them.

## Features

- **Payload producer.** Emits events from `afterChange` and `afterDelete` hooks on the collections and globals you opt in.
- **Media dependency tracking.** Changing or deleting a media file revalidates the documents that use it. See [below](#automatic-media-dependency-tracking).
- **Locale-aware.** Events carry the locale, and cache tags can include it.
- **Change detection.** Unchanged documents emit nothing, and you can exclude fields from the comparison.
- **Declarative cache mapping.** Map events to tags and paths with templates such as `[locale]:page:[slug]`, with type-checked names.
- **Custom event sources.** Any service that can send an HTTP request can trigger revalidation.
- **Configurable delivery.** Retries, timeout, deadline and bounded concurrency.
- **Extra cache layers.** Run your own invalidation, for example for a CDN, next to the Next.js cache.
- **Authenticated and bounded.** Bearer secret, constant-time comparison, and limits on body size and event count.

## Install

```sh
bun add @klnap/revalidation
```

or

```sh
npm install @klnap/revalidation
```

Requires Node `^22.23.5 || ^24.22.3 || >=26.13.1`. The Next.js consumer needs `next >=16.4.5 <17`; the Payload producer needs `payload >=3.94.1 <4`. Both are optional peers, and the core pipeline and HTTP dispatcher need neither.

## Quick start

A Next.js site that caches pages by slug, and a Payload `pages` collection that invalidates them.

**1. Share a secret.** Set the same value on both sides, and point Payload at the route:

```sh
# Next.js app and Payload app
REVALIDATION_SECRET=change-me
# Payload app only
REVALIDATION_URL=http://localhost:3000/api/revalidate
```

**2. Define tags and rules in Next.js.**

```ts
// src/revalidation.ts
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: { page: '[locale]:page:[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (cacheTags) => ({
    pages: [cacheTags.page], // events from the `pages` collection expire this tag
  }),
});
```

**3. Add the route.** Importing the module registers the configuration before the first request:

```ts
// app/api/revalidate/route.ts
import '@/revalidation';

export { POST } from '@klnap/revalidation/consumers/next';
```

**4. Tag cached data with the same tags.**

```ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
  // load and return the page
}
```

**5. Add the plugin to Payload.**

```ts
// payload.config.ts
import { http } from '@klnap/revalidation/dispatchers/http';
import { revalidation } from '@klnap/revalidation/producers/payload';
import { buildConfig } from 'payload';

export default buildConfig({
  collections: [
    {
      slug: 'pages',
      custom: { revalidation: true },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text', required: true },
      ],
    },
  ],
  plugins: [
    revalidation({
      target: {
        url: process.env.REVALIDATION_URL!,
        secret: process.env.REVALIDATION_SECRET!,
      },
      dispatcher: http(),
    }),
  ],
});
```

**6. Check it.** Edit a page in Payload. The producer sends an event with `key: "pages"`, the page's `slug`, and a `locale` (`en` when localization is off). The route expires `en:page:<slug>`, and the next request for that page reads fresh data.

The route accepts POST only and requires `Authorization: Bearer <secret>`.

## Revalidation behavior

Invalidation marks cache entries as outdated. It does not rebuild pages or refresh a page that is already open in a browser; the next request after invalidation gets fresh data.

| `mode` | Behavior |
| --- | --- |
| `expire` (default) | The next read of an invalidated tag waits for fresh data. |
| `stale` | The next read returns the previous data while fresh data loads. |

Set `mode` in `defineRevalidation`, or per rule. Use `paths` to invalidate paths, and `invalidate.layers` with `execute` for other cache layers such as a CDN.

## Payload producer

`custom.revalidation: true` enables collection `afterChange` and `afterDelete` hooks. Globals support `afterChange` only. Configure details per collection or global:

```ts
custom: {
  revalidation: {
    identifier: 'slug',
    hooks: ['afterChange', 'afterDelete'],
    excludeFields: ['updatedAt'],
  },
}
```

`identifier` accepts one field path or a list of field paths. Without it, the document slug is used as the route identifier. `enabled: false` opts an item out. Excluded fields are omitted when comparing snapshots; schema-level settings override plugin per-slug settings, which override plugin-wide `excludeFields`.

### Automatic media dependency tracking

Updating a shared image should not mean republishing every document that uses it. When a file in your upload collection is updated or deleted, the producer finds the documents that reference it and emits update events for them, so their cache expires like after a normal edit.

It works from your Payload config, so there is no registry to maintain: add an upload field and it is covered.

- **Opt-in.** Only collections and globals with `custom.revalidation` are searched.
- **Published content only.** For collections with drafts, only published documents are revalidated. A delete revalidates every dependent, before the media row is removed.
- **Locale-aware.** Only locales whose media data actually changed are revalidated.
- **Deduplicated.** A document that references the file through several fields produces one event per locale.

The upload collection is detected automatically (the only upload collection, or the one with slug `media`). Override it, or ignore fields that do not affect your pages, with the `media` option:

```ts
revalidation({
  dispatcher: http(),
  target,
  media: { collection: mediaCollection, excludeFields: ['updatedAt'] },
});
```

Fields that change what is rendered, such as `alt` text, should not be excluded.

| Schema feature | Collections | Globals |
| --- | --- | --- |
| `upload` field | Yes | Yes |
| `relationship` to the media collection | Yes | Yes |
| Inside groups, rows and named tabs | Yes | Yes |
| Inside arrays | Yes | No |
| `hasMany` | Yes | No |
| Inside blocks | No | No |
| Relationship to several collections | No | No |

## Custom event sources

The consumer does not need Payload. Describe your own source and send it a request. This example accepts `{ "key": "pricing" }` events from any service:

```ts
import * as v from 'valibot';
import { defineRevalidation } from '@klnap/revalidation/consumers/next';

defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: { pricing: 'pricing' },
  sources: {
    webhook: {
      schema: v.object({ key: v.string() }),
      resolve: ({ item }) => (item as { key: string }).key,
    },
  },
  layers: (tags) => ({
    next: [{ key: { webhook: 'pricing' }, invalidates: [tags.pricing] }],
  }),
});
```

```sh
curl -X POST https://example.com/api/revalidate \
  -H "Authorization: Bearer $REVALIDATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"webhook","data":[{"key":"pricing"}]}'
```

Custom sources use [`valibot`](https://valibot.dev) schemas, so install it in your app. An event whose `source` is unknown, whose item fails the schema, or whose key matches no rule is skipped and logged.

## HTTP dispatcher

```ts
http({
  timeoutMs: 15_000,
  deadlineMs: 5_000,
  retries: 2,
  retryDelayMs: 200,
});
```

Defaults are shown above. The dispatcher retries transport errors, timeouts, HTTP 429, and 5xx responses. Other 4xx responses and redirects are final. It does not follow redirects. HTTPS is required, except HTTP is allowed in development and tests. A deadline applies to the whole dispatch call; up to four deliveries run concurrently.


## Reliability

- Delivery is best-effort. Failures are logged and never fail the Payload save.
- There is no persistent queue or automatic recovery. A process exit can lose a pending dispatch, and an unreachable consumer means missed invalidations.
- Retries and network conditions can deliver an event more than once. Invalidation is idempotent, so this is safe for the built-in consumer; make custom consumers idempotent too.
- A `2xx` response means the consumer accepted the event, not that every cache layer is fresh.

## Security

The HTTP dispatcher sends a shared Bearer secret. Use HTTPS and keep the secret server-only. The consumer compares the authorization value in constant time and bounds request body size and event count. The protocol does not provide request signatures, replay protection, or rate limiting. Anyone with the secret can request invalidation for keys allowed by your consumer config.

## Public exports

| Subpath | Contents |
| --- | --- |
| `@klnap/revalidation` | Framework-independent pipeline, types, errors, and target helpers |
| `@klnap/revalidation/consumers/next` | Consumer: `defineRevalidation`, `createRevalidationHandler`, `createCache`, `POST` |
| `@klnap/revalidation/producers/payload` | Producer: `revalidation()` and Payload helpers |
| `@klnap/revalidation/sources/payload` | Payload wire schema and `payloadRevalidationSource()` |
| `@klnap/revalidation/dispatchers/http` | `http()` and `HttpDispatcherConfig` |
| `@klnap/revalidation/dispatchers` | Dispatcher and target helpers |

Use only these subpaths; source-file deep imports are not public API.

## License

[MIT](LICENSE)
