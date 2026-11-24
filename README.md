# `@klnap/revalidation`

Connects Payload content changes to cache invalidation. It emits events through a dispatcher; a consumer must receive them and invalidate the relevant caches.

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

`custom.revalidation` opts collections and globals into hooks. The producer alone does not invalidate a cache.

## Install

```sh
bun add @klnap/revalidation
```

or

```sh
npm install @klnap/revalidation
```

Node must be `^22.23.5 || ^24.22.3 || >=26.13.1`. The Payload producer requires `payload >=3.94.1 <4`; the Next.js consumer requires `next >=16.4.5 <17`. Both are optional peers: the core pipeline and HTTP dispatcher do not require either framework.

## Next.js consumer

Define cache tags and map producer wire events to keys configured for invalidation:

```ts
// src/revalidation.ts
import {
  defineRevalidation,
  invalidKey,
} from '@klnap/revalidation/consumers/next';

export const { tags } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: { page: '[locale]:page:[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (cacheTags) => ({
    pages: [cacheTags.page],
  }),
});
```

The `key` in a Payload event is the collection or global slug, so `pages` above selects that cache-key rule. The Payload item supplies default template parameters such as `locale` and `slug`.

Export the package's `POST` handler from the host route:

```ts
// app/api/revalidate/route.ts
export { POST } from '@klnap/revalidation/consumers/next';
```

Import the module that calls `defineRevalidation` during application startup, before requests reach the route handler. The route requires `Authorization: Bearer <secret>` matching the producer target secret. It accepts POST only.

`mode` defaults to `'expire'`, which expires tags immediately. Set `mode: 'stale'` for stale-while-revalidate. Path invalidation is available through `paths`; use `invalidate.layers` and `execute` for additional cache layers.

## Producer behavior

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

The producer can also revalidate documents that reference changed media. Set the optional `media` collection override when automatic selection is ambiguous. Media reference paths are package-defined; host config cannot register new paths.

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

Dispatch is best-effort: failures are logged and do not fail the Payload save. There is no persistent queue or automatic recovery, so a process exit can lose a pending dispatch. A `2xx` response means the consumer accepted the event, not that every cache layer is fresh. Repeated delivery is possible; make custom consumers idempotent.

## Security

The HTTP dispatcher sends a shared Bearer secret. Use HTTPS and keep the secret server-only. The consumer compares the authorization value in constant time and bounds request body size and event count. The protocol does not provide request signatures, replay protection, or rate limiting. Anyone with the secret can request invalidation for keys allowed by your consumer config.

## Public exports

- `@klnap/revalidation`: framework-independent pipeline, types, errors, and target helpers
- `@klnap/revalidation/sources/payload`: Payload wire schema and `payloadRevalidationSource()`
- `@klnap/revalidation/producers/payload`: `revalidation()` and Payload producer helpers
- `@klnap/revalidation/consumers/next`: `defineRevalidation`, `createRevalidationHandler`, `createCache`, and `POST`
- `@klnap/revalidation/dispatchers`: dispatcher and target helpers
- `@klnap/revalidation/dispatchers/http`: `http()` and `HttpDispatcherConfig`

Use only these package subpaths; source-file deep imports are not public API.

## License

[MIT](LICENSE)
