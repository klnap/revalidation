# @klnap/revalidation

Declarative, type-safe cache revalidation across independent producers and consumers.

The package uses CloudEvents 1.0, Standard Webhooks signatures, and Standard Schema V1. The
built-in integrations produce Payload CMS events, deliver them over HTTP, and consume them in
Next.js.

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

## Configure the Next.js consumer

Declare cache templates, the accepted event source schema, and rules in a server-only module:

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

Re-export `POST` from the Route Handler:

```ts
// src/app/api/revalidate/route.ts
export { POST } from '@/revalidation'
```

Use the same tag helper when caching data:

```ts
import { cacheTag } from 'next/cache'
import { tags } from '@/revalidation'

export async function getPage(locale: string, slug: string) {
  'use cache'
  cacheTag(tags.page({ locale, slug }))
  // Load the page.
}
```

## Configure the Payload producer

```ts
import { http } from '@klnap/revalidation/dispatchers/http'
import { revalidation } from '@klnap/revalidation/producers/payload'

revalidation({
  dispatcher: http({
    targets: {
      website: {
        url: process.env.REVALIDATION_URL!,
        secret: process.env.REVALIDATION_SECRET!,
      },
    },
  }),
})
```

Opt collections and globals in with `custom.revalidation`. Set the same
`REVALIDATION_SECRET` in both applications. HTTP deliveries use Standard Webhooks headers and
CloudEvents structured JSON.

## Concepts

- **CloudEvent:** An immutable event with a source URI, ID, type, and application data.
- **Source schema:** A Standard Schema V1 validator selected by the CloudEvent's `source`.
- **Rule:** Matches event attributes and maps validated affected resources to tags or paths.
- **Dispatcher target:** A named delivery destination. Targets are separate from cache tags and paths.

Payload events use source `urn:klnap:revalidation:payload`. One event uses
`application/cloudevents+json`; a batch uses `application/cloudevents-batch+json`.

## Verification

- `bun run check` runs formatting, lint, type checks, unit tests, static analysis, and package checks.
- `bun run test:integration` runs Payload database integration tests.
- `bun run test:consumer-smoke -- <tarball>` tests an installed package; with no tarball, it packs
  the current build. It also tests a production Next.js cache runtime.

See [Next.js consumer](docs/consumers/next.md), [Payload producer](docs/producers/payload.md),
[HTTP dispatcher](docs/dispatchers/http.md), [security](docs/security.md), and
[reliability](docs/reliability.md).

## License

MIT. See [LICENSE](LICENSE).
