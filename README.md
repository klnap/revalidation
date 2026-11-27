# `@klnap/revalidation`

Declarative, type-safe cache invalidation across applications, with a framework-independent event
protocol and native integrations. Producers send authenticated change events; consumers choose how
those changes affect their caches.

Built-in integrations cover Payload CMS event production, HTTP delivery, and Next.js cache
invalidation. The event and dispatcher contracts stay framework-independent.

## Quick example

Configure the Next.js consumer:

```ts
// website/src/revalidation.ts
import 'server-only'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

export const { tags, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: {
    pages: '[locale]:pages',
    page: '[locale]:page:[slug]',
  },
  rules: ({ tags }) => ({
    'payload.collection.pages': [tags.pages, tags.page],
  }),
})
```

Expose the handler and tag cached data:

```ts
// website/src/app/api/revalidate/route.ts
export { POST } from '@/revalidation'
```

```ts
import { cacheTag } from 'next/cache'
import { tags } from '@/revalidation'

export async function getPage(locale: string, slug: string) {
  'use cache'
  cacheTag(tags.page({ locale, slug }))
  return loadPage(locale, slug)
}
```

Connect the Payload producer:

```ts
// cms/src/payload.config.ts
import { revalidation } from '@klnap/revalidation/producers/payload'
import { http } from '@klnap/revalidation/dispatchers/http'

export const revalidationPlugin = revalidation({
  source: 'https://cms.example.com',
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

Register the plugin in Payload's `plugins` array and opt collections into change detection with
`custom.revalidation`. The cache example requires `cacheComponents: true` in `next.config.ts`.
See [Usage](#usage) for integration guides.

## Why?

Content often changes in one service while cached data lives in another. The producer knows what
changed; the consumer knows which cache entries depend on it. This package connects them through
authenticated events without coupling producers to Next.js routes or cache keys.

Use native invalidation when writes and cache live in one application. Use this package across a
service boundary.

## Features

- Typed cache tag and path templates with declarative resource-to-cache mappings.
- Previous and current identifiers are both invalidated when a route identifier changes.
- Payload hooks support localization, publish state, media dependencies, field exclusions, and
  configured reorder integrations.
- CloudEvents 1.0, Standard Webhooks authentication, and Standard Schema V1 validation.
- Named HTTP targets, event filtering, bounded retries, deadlines, and delivery outcomes.
- Framework-independent event contracts for application-owned producers, dispatchers, and
  consumers.

## Installation

```sh
bun add @klnap/revalidation
```

```sh
npm install @klnap/revalidation
```

Next.js and Payload are optional peers. Install only the framework integration used by each
application; the framework-independent event and dispatcher contracts require neither peer.

## Usage

### Producer

Use the built-in Payload plugin to emit resource-change events from opted-in collections and
globals. A producer outside Payload can emit the same event contract or define a custom event type.

- [Payload producer quick start and lifecycle behavior](./docs/producers/payload.md)
- [Custom producers and event types](./docs/producers/custom.md)
- [Payload media dependencies](./docs/producers/payload-media-dependencies.md)

### Dispatcher

The built-in HTTP dispatcher signs CloudEvents requests and supports named targets. Implement the
public dispatcher contract for another transport or delivery policy.

- [HTTP dispatcher setup, limits, and outcomes](./docs/dispatchers/http.md)
- [Custom dispatcher contract](./docs/dispatchers/custom.md)

### Consumer

The built-in Next.js consumer authenticates and validates events, resolves rules, and invalidates
tags or paths. Other frameworks can compose the public protocol primitives, but the package does
not provide a generic consumer factory.

- [Next.js consumer setup and configuration](./docs/consumers/next.md)
- [Custom consumer responsibilities and exported primitives](./docs/consumers/custom.md)

### Custom cache operations

The Next.js consumer can run application-owned operations before dependent invalidation. See
[custom execution](./docs/extending.md#custom-execution-commerce-indexing).

## Configuration

### Producer

Configure a stable absolute-URI `source` and a `dispatcher`. Collections and globals opt in with
`custom.revalidation`; collection options include identifiers, hook selection, and ordering.
See the [Payload producer reference](./docs/producers/payload.md).

### Dispatcher

Configure HTTP targets by stable name with a destination `url` and signing `secret`. Target
filters, retries, timeouts, deadlines, and payload limits are described in the
[HTTP dispatcher reference](./docs/dispatchers/http.md).

### Consumer

`defineRevalidation()` accepts the signing `secret`, cache `tags` and `paths`, declarative `rules`,
optional event `schemas`, optional `allowedSources`, native cache `profile`s, and custom `execute`
operations.
See the [Next.js consumer reference](./docs/consumers/next.md).

## Compatibility

- Node.js `^22.23.5 || ^24.22.3 || >=26.13.1`.
- TypeScript 5.0 or later for the exported type surface.
- Next.js `>=16.4.5 <17` for the Next.js consumer.
- Payload `>=3.94.1 <4` for the Payload producer.

Delivery is best-effort: bounded retries can duplicate events, while outages or process termination
can lose them. Ordinary Payload lifecycle hooks run before transaction commit; a later rollback
cannot retract a delivered event. Review the [reliability](./docs/reliability.md) and
[security](./docs/security.md) limitations before deployment.

## Documentation

### Producers

- [Payload CMS](./docs/producers/payload.md)
- [Custom producers and event types](./docs/producers/custom.md)
- [Payload media dependencies](./docs/producers/payload-media-dependencies.md)

### Dispatchers

- [HTTP](./docs/dispatchers/http.md)
- [Custom dispatcher contract](./docs/dispatchers/custom.md)

### Consumers

- [Next.js](./docs/consumers/next.md)
- [Custom consumers](./docs/consumers/custom.md)
- [Custom cache operations](./docs/extending.md)

### Concepts and operations

- [Architecture](./docs/concepts/architecture.md)
- [Event contract](./docs/concepts/event-contract.md)
- [Cache templates and rule semantics](./docs/concepts/cache-tags.md)
- [Reliability](./docs/reliability.md)
- [Security](./docs/security.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Migration from 0.4.0 to 0.5.0](./docs/migration/0.4.0-to-0.5.0.md)

## License

[MIT](./LICENSE)
