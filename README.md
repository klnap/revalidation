# @klnap/revalidation

Declarative, type-safe cache revalidation.

Declare cache tags and paths once, then use typed helpers both when caching data and when mapping producer events to revalidation rules.

## Requirements

- Node.js `^22.23.5 || ^24.22.3 || >=26.13.1`
- TypeScript `>=5.0`
- Next.js `>=16.4.5 <17` for the Next.js consumer
- Payload `>=3.94.1 <4` for the Payload producer

Install with Bun or npm:

```sh
bun add @klnap/revalidation
# or
npm install @klnap/revalidation
```

The core and HTTP dispatcher do not require Next.js or Payload. If your application imports Valibot schemas for a custom source, add `valibot` as a direct dependency.

## Quick start

This example uses a multilingual Next.js app with Payload pages. Payload sends each page event with `key: "pages"`, its locale, and its slug.

Enable Cache Components:

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = { cacheComponents: true };
export default nextConfig;
```

Declare cache templates separately from the server-only consumer configuration:

```ts
// src/cache-targets.ts
import { defineRevalidationTags } from '@klnap/revalidation/consumers/next/tags';

export const cacheTargets = {
  tags: { page: '[locale]:page:[projectSlug]' },
  paths: { page: '/[locale]/[projectSlug]' },
} as const;

export const { tags, paths } = defineRevalidationTags(cacheTargets);
```

Configure event resolution, rules, and the bound handler:

```ts
// src/revalidation.ts
import 'server-only';
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';
import { cacheTargets } from '@/cache-targets';

export const { POST } = defineRevalidation({
  ...cacheTargets,
  secret: process.env.REVALIDATION_SECRET!,
  mode: 'expire',
  resolve: (event) => event.key ?? invalidKey(),
  params: (event) => ({
    locale: event.locale,
    projectSlug: event.slug,
  }),
  rules: ({ tags, paths }) => ({
    pages: { tags: [tags.page], paths: [paths.page] },
  }),
});
```

The rule key, `pages`, must match the key returned by `resolve`. Read it as: “When an event resolves to `pages`, invalidate its localized page tag and path.” `params` maps the producer's `slug` field to the template's `projectSlug` parameter. `invalidKey()` skips an item that has no valid rule key.

Re-export the configuration-bound handler from a Route Handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation';
```

Use the same tag helper when caching the page:

```ts
// src/lib/pages.ts
import { cacheTag } from 'next/cache';
import { tags } from '@/cache-targets';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, projectSlug: slug }));
  // Load the page.
}
```

Configure Payload to send events to the Route Handler:

```ts
// payload.config.ts (database and admin options omitted)
import { http } from '@klnap/revalidation/dispatchers/http';
import { revalidation } from '@klnap/revalidation/producers/payload';
import { buildConfig } from 'payload';

export default buildConfig({
  localization: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  collections: [
    {
      slug: 'pages',
      custom: { revalidation: true },
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'slug', type: 'text', required: true, localized: true },
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

Set `REVALIDATION_SECRET` in both applications and point `REVALIDATION_URL` at `/api/revalidate`. Payload dispatches events after the save hook; delivery is best-effort. See [reliability](docs/reliability.md).

## Rules and modes

Rules map resolved event keys to tags or paths. A rule can use the tag-array shorthand or an object containing `tags`, `paths`, and a per-rule `mode`. The global mode defaults to `expire`; a rule mode overrides it for that rule's tags.

For example, this rule changes `pages` to `stale` while all other rules keep the global `expire` mode:

```ts
rules: ({ tags, paths }) => ({
  pages: {
    tags: [tags.page],
    paths: [paths.page],
    mode: 'stale',
  },
})
```

- `expire` expires a tag immediately. The next read waits while Next.js regenerates the entry.
- `stale` marks a tag stale. The next read may serve stale data while Next.js refreshes it in the background.
- Paths use `revalidatePath(path)` without a profile; Next.js revalidates the path on its next visit.

Revalidation does not push an update to an already open page. See the [Next.js consumer guide](docs/consumers/next.md#revalidation-modes).

## Custom cache layers

The simple `rules` callback creates the built-in `next` layer. To add a CDN or another cache, use `rules.layers` and provide an `execute` function for each custom layer:

```ts
rules: {
  layers: {
    next: ({ tags, paths }) => ({
      pages: { tags: [tags.page], paths: [paths.page] },
    }),
    cdn: ({ tags }) => ({ pages: [tags.page] }),
  },
},
execute: {
  cdn: async ({ tags }) => purgeCdn(tags.map((tag) => tag.value)),
},
```

For schema-validated event sources, use the advanced `sources` and `layers` DSL. See [custom sources](docs/sources/custom.md).

## Other integrations

- [Next.js consumer](docs/consumers/next.md): standalone setup, event resolution, custom parameters, modes, and custom cache layers.
- [Payload producer](docs/producers/payload.md): collection and global hooks, localization, and change detection.
- [Custom sources](docs/sources/custom.md): validate other event shapes with the advanced `sources` and `layers` DSL.
- [HTTP dispatcher](docs/dispatchers/http.md): delivery retries and limits.
- [Architecture](docs/concepts/architecture.md): producer, dispatcher, consumer, and cache-layer contracts.

## License

MIT. See [LICENSE](LICENSE).
