# @klnap/revalidation

Cache revalidation for Next.js, driven by events. The Next.js **consumer** is a protected route that expires cache tags and paths when it receives an event, and you can use it on its own from any system that can send an HTTP request. **Producers** emit those events from a CMS; Payload CMS is supported today. A **dispatcher** carries events from a producer to the consumer.

```
CMS (producer)  ──▶  dispatcher (HTTP)  ──▶  Next.js route (consumer)  ──▶  revalidateTag / revalidatePath
```

| Part | Role | Included |
| --- | --- | --- |
| Consumer | Receives events, maps them to cache tags and paths, invalidates them | Next.js |
| Producer | Emits an event when content changes | Payload CMS |
| Dispatcher | Delivers events to a consumer | HTTP |

Use the consumer alone, or add the Payload producer to get automatic events, including [revalidation of the pages that use a changed media file](#media-dependent-revalidation).

## Install

```sh
bun add @klnap/revalidation
```

or

```sh
npm install @klnap/revalidation
```

Node must be `^22.23.5 || ^24.22.3 || >=26.13.1`. The Next.js consumer requires `next >=16.4.5 <17`; the Payload producer requires `payload >=3.94.1 <4`. Both are optional peers, and the core pipeline and HTTP dispatcher need neither.

## Consumer: Next.js

Define your cache tags and how events map to them, then export the package's route handler.

```ts
// src/revalidation.ts
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: { page: '[locale]:page:[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (cacheTags) => ({
    pages: [cacheTags.page],
  }),
});
```

```ts
// app/api/revalidate/route.ts
export { POST } from '@klnap/revalidation/consumers/next';
```

Import the module that calls `defineRevalidation` during application startup, before requests reach the route. The route accepts POST only and requires `Authorization: Bearer <secret>`. `mode` defaults to `'expire'`, which expires tags immediately; set `mode: 'stale'` for stale-while-revalidate. Use `paths` to invalidate paths, and `invalidate.layers` with `execute` for other cache layers such as a CDN.

Use the same tags where you cache data, so invalidation hits what you cached:

```ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
  // ...
}
```

### Without a CMS

The consumer does not need Payload. Describe your own event source and send it a request. This example accepts `{ "key": "pricing" }` events from any service:

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

Custom sources use [`valibot`](https://valibot.dev) schemas, so install it in your app (`bun add valibot` or `npm install valibot`). An event whose `source` is unknown, whose item fails the schema, or whose key matches no rule is skipped and logged.

## Producer: Payload CMS

`revalidation()` is a Payload plugin that emits an event when content changes. Collections and globals opt in with `custom.revalidation`.

```ts
import { http } from '@klnap/revalidation/dispatchers/http';
import { revalidation } from '@klnap/revalidation/producers/payload';

const pages = {
  slug: 'pages',
  custom: { revalidation: true },
  fields: [{ name: 'title', type: 'text' }],
};

const plugins = [
  revalidation({
    target: {
      url: process.env.REVALIDATION_URL!,
      secret: process.env.REVALIDATION_SECRET!,
    },
    dispatcher: http(),
  }),
];
```

The producer alone does not invalidate a cache: it needs a consumer, such as the Next.js route above, at `REVALIDATION_URL`. The `key` in a Payload event is the collection or global slug, so `pages` selects the cache-key rule named `pages` in the consumer. The event item also carries `locale`, `slug` and other fields that fill template parameters such as `[locale]` and `[slug]`.

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

`identifier` accepts one field path or a list of field paths. Without it, the document slug is used as the route identifier. `enabled: false` opts a schema item out. Excluded fields are omitted when comparing snapshots; schema-level settings override plugin per-slug settings, which override plugin-wide `excludeFields`.

### Media-dependent revalidation

Replace or edit an image and every page that uses it stays stale, because only the media document changed. The producer closes that gap: when a file in your upload collection is updated or deleted, it finds the documents that reference it and emits update events for them, so the consumer expires their cache like after a normal edit.

- **Automatic.** It reads your upload fields (`upload` or `relationship` fields pointing at the media collection) from the Payload config, including those inside rows, groups, named tabs and arrays, and `hasMany` fields. There is no registry to maintain: add an upload field and it is covered.
- **Opt-in per document type.** Only collections and globals that set `custom.revalidation` are searched, so you control which events are emitted.
- **Published content only.** For collections with drafts, only published documents are revalidated. A delete revalidates every dependent, before the media row is removed.
- **Locale-aware.** Only the locales whose media data actually changed are revalidated. `excludeFields` (for example `['alt']`) ignores fields that do not affect output.
- **Deduplicated.** A document that references the file through several fields produces one event per locale.

The upload collection is detected automatically (the only upload collection, or the one with slug `media`). Override it, or exclude fields, with the `media` option:

```ts
revalidation({
  dispatcher: http(),
  target,
  media: { collection: mediaCollection, excludeFields: ['alt'] },
});
```

Blocks and relationships that allow several collections are not followed. In globals, upload fields inside arrays and `hasMany` uploads are skipped.

## Dispatcher: HTTP

```ts
http({
  timeoutMs: 15_000,
  deadlineMs: 5_000,
  retries: 2,
  retryDelayMs: 200,
});
```

Defaults are shown above. The dispatcher retries transport errors, timeouts, HTTP 429, and 5xx responses. Other 4xx responses and redirects are final. It does not follow redirects. HTTPS is required, except HTTP is allowed in development and tests. A deadline applies to the whole dispatch call; up to four deliveries run concurrently.

Dispatch is best-effort: failures are logged and do not fail the Payload save. There is no persistent queue or automatic recovery, so a process exit can lose a pending dispatch. A `2xx` response means the consumer accepted the event, not that every cache layer is fresh. Repeated delivery is possible; make custom consumers idempotent.

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
