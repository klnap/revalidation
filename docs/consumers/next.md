# Next.js consumer

The consumer is a Route Handler that accepts revalidation events and expires cache tags and paths. It does not depend on Payload: any system that sends the event envelope can use it.

Requires `next >=16.4.5 <17`. Cached functions use Cache Components (`cacheComponents: true` in `next.config`).

## Setup

Two modules are needed:

1. A module that calls `defineRevalidation` (the declarations). Import it from the route file, so the declarations are registered in the same module graph as the handler.
2. The route file that re-exports `POST`.

```ts
// src/revalidation.ts
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags, paths } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: { page: '[locale]:page:[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (cacheTags) => ({ pages: [cacheTags.page] }),
});
```

```ts
// src/app/api/revalidate/route.ts
import '@/revalidation';

export { POST } from '@klnap/revalidation/consumers/next';
```

`POST` accepts only `POST`, requires `Authorization: Bearer <secret>`, and reads its configuration from the declarations registered by `defineRevalidation`. If nothing was registered, the handler throws `defineRevalidation must be called before the revalidation consumer POST route`.

### Module boundaries

- Import the declarations from the route file, or from a module that the route file imports. If the route is in a separate module graph where `defineRevalidation` never ran, `POST` fails with the message above.
- Import the declarations in server code only. The consumer imports `next/cache`; keep `@/revalidation` out of client components.
- In development, calling `defineRevalidation` again with the same secret replaces the configuration, and `POST` picks up the new one. In production, repeating the same configuration object reuses its registration; a different object throws. Configure the consumer once.

### Explicit configuration

`createRevalidationHandler(config)` builds a handler from a configuration object without the registry, for example in tests or in a route that must not share module state. `createCache(config)` returns `{ route, inspect }`: `route` is the handler, and `inspect` shows what an event would invalidate without executing it.

## Tags and paths

Tags are templates with parameters. The `tags` helpers are generated from the templates; see [cache tags](../concepts/cache-tags.md). Paths work the same way:

```ts
export const { tags, paths } = defineRevalidation({
  secret,
  tags: { page: '[locale]:page:[slug]' },
  paths: { pagePath: '/[locale]/[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (t, p) => ({
    pages: { tags: [t.page], paths: [p?.pagePath] },
  }),
});
```

In the simple form, `invalidate` returns tags only. Use the object form when a rule also invalidates paths. Path invalidation calls `revalidatePath`.

Parameters come from the event: the item's `locale`, `slug`, `documentId` and other fields that match a template parameter name. Use `params` to compute or rename parameters.

## Event resolution

For each item of an event:

1. The item is checked against the source schema. Items that fail are skipped (full DSL; see [custom sources](../sources/custom.md)).
2. `resolve` returns the cache key. An empty key, or `invalidKey()`, skips the item.
3. Rules whose key matches the cache key are selected.
4. Each selected rule renders its tags and paths from the item's parameters. A tag or path with a missing parameter is skipped and logged when a `logger` is configured.
5. Layers run the invalidation.

Unmatched keys are skipped and the request still succeeds.

## Modes

| Mode | Call | Behavior |
| --- | --- | --- |
| `expire` (default) | `revalidateTag(tag, { expire: 0 })` | The next read of an invalidated entry waits for fresh data. |
| `stale` | `revalidateTag(tag, 'max')` | The next read may return the previous entry while fresh data is generated in the background. |

Set `mode` on the configuration, on a rule, or on a `{ tags, paths, mode }` object. The most specific setting wins: rule, then object, then configuration. `revalidatePath` is called without a profile.

Invalidating a tag marks entries as outdated; it does not rebuild pages or refresh a page that is already open in a browser. The next request after invalidation gets fresh data.

## Custom cache layers

A layer is a named set of operations. The built-in `next` layer is implied by the simple form and required in the `layers` form. Other layers, for example a CDN, need an `execute` handler:

```ts
export const { tags } = defineRevalidation({
  secret,
  tags: { page: '[locale]:page:[slug]' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: {
    layers: {
      next: (t) => ({ pages: [t.page] }),
      cdn: (t) => ({ pages: { tags: [t.page] } }),
    },
  },
  execute: {
    cdn: async ({ tags, requestId }) => {
      // Purge the CDN entries for `tags` here.
    },
  },
});
```

A layer that has no `execute` handler and is not `next` fails the request with `500`, and the body names the layer. The other layers still run. Each failing layer is logged as `cache.layer.executed`.

## Authentication and limits

- The `Authorization` header must be `Bearer <secret>`. The comparison is constant-time. Anything else gets `401`.
- Bodies are limited to 256 KiB by default (`maxBodyBytes`). Larger bodies get `400`.
- The handler counts streamed bytes and starts cancellation after the limit; it does not wait for the stream's cancellation promise before returning `400`. The framework owns transport cleanup.
- Events are limited to 100 items by default (`maxEvents`). A larger event gets `400`. The producer splits its changes into events of at most 100 items.

See [security](../security.md) for what these checks do not protect against.

## Responses

| Situation | Status | Body |
| --- | --- | --- |
| Accepted (including items that were skipped) | `200` | `{"success":true,"requestId","cacheKeys"}`; the `X-Cache-Request-Id` header repeats the request id |
| Missing or wrong bearer token | `401` | `{"error":"Unauthorized"}` |
| Method other than `POST` | `405` | `{"error":"Method not allowed"}` |
| Invalid JSON, missing `source`, body too large, too many items | `400` | Error message |
| Unknown `source` with the full DSL | `400` | `Unknown source: <name>` |
| Failing custom or Next layer | `500` | `Layer execution failed: <layer>` |
| `resolve` throws | `500` | The error message |

With the simple form, any `source` name is accepted and routed through the `*` rule. Only items that are not objects are skipped.

## Verification status

- The source-repository unit tests cover request handling, tag generation, rule matching and layer execution. Tests are not included in the npm package.
- The [Quick Start consumer test](https://github.com/klnap/revalidation/blob/main/tests/unit/consumers/next/readme-quickstart.test.ts) and [custom source test](https://github.com/klnap/revalidation/blob/main/tests/unit/consumers/next/standalone-source.test.ts) live in the source repository.
- Module-graph behavior across Route Handlers, instrumentation and Server Components, and production builds, was not exercised against a running Next.js application. Verify it in your application before relying on it.
