# @klnap/revalidation

Event-driven cache revalidation for Next.js. A content change produces an event; the event expires the cache tags and paths that depend on it. Declare each cache tag once and use the same declaration in your cached functions and in your invalidation rules.

```
Payload CMS (producer) ──┐
                         ├─► dispatcher (HTTP) ─► Next.js route (consumer) ─► revalidateTag / revalidatePath
Any HTTP client ─────────┘
```

Producers emit events, dispatchers deliver them, and the consumer turns them into cache invalidation. Each part can be used on its own: the consumer works without Payload, and the Payload producer is one of several ways to send events.

## Why

Cache tags are strings. Without a shared definition they get copied into cached functions, route handlers and invalidation rules, and the copies drift apart. A missed or misspelled tag leaves stale content in the cache with no error.

This package keeps one declaration per tag and generates the strings from it. `tags.page({ locale, slug })` produces the same string in the cached function and in the rule that invalidates it. Declarations are typed, so an unknown tag name or a non-string parameter does not compile. See [cache tags](docs/concepts/cache-tags.md) for what the types do and do not guarantee.

## Features

- **Single source of truth for cache tags.** Templates such as `[locale]:page:[slug]` produce tag helpers you export and import anywhere.
- **Declarative invalidation rules.** Map event keys to tags and paths in one place, next to the declarations.
- **Typed tag helpers.** Unknown tag names, missing call arguments and non-string parameters are compile-time errors.
- **Independent components.** Consumer, producer, source, and dispatcher are separate modules with separate exports.
- **Payload producer.** Hooks on opted-in collections and globals, with change detection, locale and draft handling.
- **Media dependency tracking.** Changing a shared media file revalidates the documents that use it. See [media dependencies](docs/producers/payload-media-dependencies.md).
- **Custom sources and cache layers.** Accept events from any system, and invalidate other caches (for example a CDN) next to the Next.js cache.
- **Authenticated, bounded delivery.** Bearer secret, body and event limits, retries with a deadline, and bounded concurrency.

## Install

```sh
bun add @klnap/revalidation
```

or `npm install @klnap/revalidation`.

Requirements:

- Node `^22.23.5 || ^24.22.3 || >=26.13.1`
- TypeScript `>=5.0` for TypeScript consumers
- `next >=16.4.5 <17` for the Next.js consumer (optional peer)
- `payload >=3.94.1 <4` for the Payload producer (optional peer)

The core pipeline and the HTTP dispatcher need neither framework. Custom sources need [`valibot`](https://valibot.dev) in your application.

## Quick start

One integration, from declaration to verification. It uses Bun, Next.js 16 with Cache Components, and a Payload `pages` collection with a `slug` field.

**1. Set the shared secret** in both applications:

```sh
# Next.js app (.env.local)
REVALIDATION_SECRET=replace-with-a-long-random-value

# Payload app (.env)
REVALIDATION_SECRET=replace-with-a-long-random-value
REVALIDATION_URL=http://localhost:3000/api/revalidate
```

**2. Declare the tags and the rules once.** Keys in `invalidate` are event keys: the Payload collection or global slug.

```ts
// src/revalidation.ts
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: {
    page: '[locale]:page:[slug]',
    siteSettings: '[locale]:site-settings',
  },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (cacheTags) => ({
    pages: [cacheTags.page],
    'site-settings': [cacheTags.siteSettings],
  }),
});
```

**3. Use the exported helpers in cached functions.** This requires Cache Components (`cacheComponents: true` in `next.config`).

```ts
// src/lib/content.ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
  // Load the page from Payload here.
}

export async function getSiteSettings(locale: string) {
  'use cache';
  cacheTag(tags.siteSettings({ locale }));
  // Load the settings from Payload here.
}
```

**4. Create the Route Handler.** The import registers the declarations in the same module graph as the handler.

```ts
// src/app/api/revalidate/route.ts
import '@/revalidation';

export { POST } from '@klnap/revalidation/consumers/next';
```

**5. Configure the Payload producer.** Opt in with `custom.revalidation`.

```ts
// payload.config.ts (db, secret and admin options omitted)
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
  globals: [
    {
      slug: 'site-settings',
      custom: { revalidation: true },
      fields: [{ name: 'siteName', type: 'text' }],
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

**6. Verify.** Open `/api/revalidate` with a GET request to confirm the route exists (it answers `405`). Load a page with `getPage('en', 'about')`, then change its title in Payload and save. Payload sends an event with `key: "pages"`, `locale: "en"` and `slug: "about"`. The consumer expires `en:page:about`, the same string `getPage` tagged, so the next request reads fresh data.

Events are delivered after the save, so the expiry arrives shortly afterwards and not inside the save request. See [reliability](docs/reliability.md).

## Consumers

The Next.js consumer receives events, matches them to your rules, and calls `revalidateTag` and `revalidatePath`. It does not depend on Payload. Full guide: [docs/consumers/next.md](docs/consumers/next.md).

## Producers

A producer emits events when content changes. The Payload producer is the built-in one: a plugin that sends events from collection and global hooks. Full guide: [docs/producers/payload.md](docs/producers/payload.md). Media dependency tracking: [docs/producers/payload-media-dependencies.md](docs/producers/payload-media-dependencies.md).

Any system that can send an HTTP request with the event envelope can also be a producer. See [sources](docs/sources/custom.md).

## Sources

A source defines the shape of an event item (its validation) and how the item maps to a cache key. The built-in source is the Payload wire format, `payloadRevalidationSource()`. A custom source accepts other shapes. Full guide: [docs/sources/custom.md](docs/sources/custom.md).

## Dispatchers

A dispatcher delivers events from a producer to a consumer. The built-in dispatcher is HTTP. A dispatcher is any object with a `dispatch` method that returns an outcome; the Payload plugin accepts one. Full guide: [docs/dispatchers/http.md](docs/dispatchers/http.md).

## Architecture and extension

- [Architecture](docs/concepts/architecture.md): responsibilities of each component and what can be used on its own.
- [Extending revalidation](docs/extending.md): which extension points are public and supported.

## Reliability and security

- [Reliability](docs/reliability.md): what an accepted event does and does not guarantee.
- [Security](docs/security.md): authentication, limits, and what is not protected.
- [Troubleshooting](docs/troubleshooting.md): common responses and log messages.

## Public exports

| Subpath | Contents |
| --- | --- |
| `@klnap/revalidation` | `createPipeline`, dispatch outcome helpers, error classes, target normalization, and core contracts |
| `@klnap/revalidation/consumers/next` | `defineRevalidation`, `defineRevalidationTags`, `createCache`, `createRevalidationHandler`, `POST`, `invalidKey`, and consumer types |
| `@klnap/revalidation/producers/payload` | `revalidation()`, `revalidationOrderableHooks`, exclude-field helpers, and producer types |
| `@klnap/revalidation/sources/payload` | Payload wire item schema, `PayloadRevalidationItem`, and `payloadRevalidationSource()` |
| `@klnap/revalidation/dispatchers` | `http`, target helpers, and dispatcher types |
| `@klnap/revalidation/dispatchers/http` | `http()` and `HttpDispatcherConfig` |

Only these subpaths and their declared exports are public. The contract tests pin runtime export names, and type tests compile against generated package declarations. Files under `src/` are not public.

## Changelog and license

See [CHANGELOG.md](CHANGELOG.md). Licensed under the [MIT License](LICENSE).
