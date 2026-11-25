# @klnap/revalidation

Declarative, type-safe cache revalidation for Next.js and Payload CMS.

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

Declare tags, paths, event resolution, and rules in one server-only module:

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

The rule key, `pages`, must match the key returned by `resolve`. When an event resolves to `pages`, the rule builds both cache targets using that event's locale and slug. `invalidKey()` skips an item that has no valid rule key.

Re-export the configuration-bound handler from a Route Handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation';
```

Use the same tag helper when caching the page:

```ts
// src/lib/pages.ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
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

- `expire` expires a tag immediately. The next read waits while Next.js regenerates the entry.
- `stale` marks a tag stale. The next read may serve stale data while Next.js refreshes it in the background.
- Paths use `revalidatePath(path)` without a profile; Next.js revalidates the path on its next visit.

Revalidation does not push an update to an already open page. See the [Next.js consumer guide](docs/consumers/next.md#modes).

## Other integrations

- [Next.js consumer](docs/consumers/next.md): standalone setup, event resolution, custom parameters, modes, and custom cache layers.
- [Payload producer](docs/producers/payload.md): collection and global hooks, localization, and change detection.
- [Custom sources](docs/sources/custom.md): validate other event shapes with the advanced `sources` and `layers` DSL.
- [HTTP dispatcher](docs/dispatchers/http.md): delivery retries and limits.
- [Architecture](docs/concepts/architecture.md): producer, dispatcher, consumer, and cache-layer contracts.

## License

MIT. See [LICENSE](LICENSE).
