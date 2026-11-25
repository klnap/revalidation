# @klnap/revalidation

Declarative, type-safe cache revalidation.

Define cache tags once, reuse them throughout your application, and declaratively control when they are invalidated.

Built on an extensible, event-driven architecture with native integrations for Next.js and Payload CMS.

The generated helpers make cached functions and invalidation rules share the same tag declaration:

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

```ts
// src/lib/articles.ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
  // Load the page.
}
```

`tags.page({ locale, slug })` builds the tag in ordinary server-side code. The `pages` rule uses the same helper declaration when a matching event arrives. TypeScript checks declared tag names, required template parameters, and string parameter values; it does not guarantee event delivery or cache freshness. See [cache tags](docs/concepts/cache-tags.md).

## Why revalidation

Cache tags are strings. Duplicating them across cached functions and invalidation rules lets names drift. A missing or misspelled tag can leave an entry untouched without an error. This package generates typed helpers from one declaration and lets event rules reference those same declarations.

## Key features

- Declare parameterized and static tags once, then import generated helpers into server-side application code.
- Define rules that map event keys to tags and paths.
- Use independent consumers, producers, sources, and dispatchers.
- Receive Payload collection and global events with change detection, localization, and draft handling.
- Revalidate documents that depend on changed media.
- Add custom event sources and cache layers, including caches alongside Next.js.
- Bound and authenticate the built-in HTTP consumer and dispatcher.

## Installation and compatibility

```sh
bun add @klnap/revalidation
# or
npm install @klnap/revalidation
```

Requirements:

- Node.js `^22.23.5 || ^24.22.3 || >=26.13.1`
- TypeScript `>=5.0` for TypeScript consumers
- Next.js `>=16.4.5 <17` for the optional Next.js consumer
- Payload `>=3.94.1 <4` for the optional Payload producer

The core and HTTP dispatcher do not require either framework. If your application imports Valibot schemas for a custom source, add `valibot` as a direct dependency.

## Quick start

This example uses Next.js 16 Cache Components and a Payload `pages` collection with a required `slug` field. The Next.js consumer also works without Payload; any producer can send a compatible event.

**1. Configure the shared secret and URL.** Keep the same secret in both server environments.

```sh
# Next.js .env.local
REVALIDATION_SECRET=replace-with-a-long-random-value

# Payload .env
REVALIDATION_SECRET=replace-with-a-long-random-value
REVALIDATION_URL=http://localhost:3000/api/revalidate
```

**2. Enable Cache Components in Next.js.**

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

**3. Declare the tags and invalidation rules.** The `resolve` callback must return a key; use `invalidKey()` when the event has no valid key. Rules use the producer's event key, which is the collection or global slug for Payload.

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

**4. Use the exported helpers in cached server functions.**

```ts
// src/lib/content.ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
  // Load the page.
}

export async function getSiteSettings(locale: string) {
  'use cache';
  cacheTag(tags.siteSettings({ locale }));
  // Load the settings.
}
```

**5. Register the declarations and expose the Route Handler.** Import the declaration module from the route so both use the same server module graph. Keep this module out of client components.

```ts
// src/app/api/revalidate/route.ts
import '@/revalidation';

export { POST } from '@klnap/revalidation/consumers/next';
```

**6. Configure Payload and opt in the content that should emit events.**

```ts
// payload.config.ts (database and admin options omitted)
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

Payload sends collection events with `key: "pages"` and global events with `key: "site-settings"`. The locale and slug fields supply the template parameters. Events are dispatched after the save hook, not synchronously inside the save request. Delivery is best-effort; see [reliability](docs/reliability.md).

## Consumers

The Next.js consumer is a Route Handler that validates events, resolves keys, matches rules, and invalidates tags or paths. It can run without Payload. The guide covers standalone setup, explicit handler configuration, module registration, custom sources, and custom cache layers: [Next.js consumer](docs/consumers/next.md).

## Producers

Payload is the built-in producer. Opt in collections and globals with `custom.revalidation`; its hooks detect content changes, account for locales and publication state, retain previous identifiers, and track media dependents. Other systems can produce compatible events without using Payload.

- [Payload producer](docs/producers/payload.md)
- [Media dependency tracking](docs/producers/payload-media-dependencies.md)

## Sources

A source defines and validates event items and maps each item to a cache key for the consumer's rules. The built-in source describes Payload's wire format. Custom sources let consumers accept other event shapes: [sources](docs/sources/custom.md).

## Dispatchers

A dispatcher handles delivery from a producer to a consumer. The built-in HTTP dispatcher retries selected failures within a deadline; it does not provide a persistent queue. Other dispatchers can implement the public dispatcher contract: [HTTP dispatcher](docs/dispatchers/http.md).

## Architecture and extensibility

```text
Producer → Dispatcher → Consumer → Cache layers
                           └─ Source validation and event-to-key mapping
```

The framework-independent core defines shared event, source, and dispatcher contracts. The consumer interprets events through sources and rules; the producer and transport are independent choices. See [architecture](docs/concepts/architecture.md) and [extension points](docs/extending.md).

## Reliability and security

- [Reliability](docs/reliability.md): delivery, retries, transaction timing, skipped events, and cache behavior.
- [Security](docs/security.md): authentication, request limits, transport, and security boundaries.
- [Troubleshooting](docs/troubleshooting.md): common responses and log messages.

## License

MIT. See [LICENSE](LICENSE).
