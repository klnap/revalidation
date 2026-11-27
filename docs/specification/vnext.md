# `@klnap/revalidation` 0.5.0 candidate specification

## Status

Candidate specification. It records the API and protocol decisions implemented for the next release.
The accepted 0.4.0 baseline remains in `0.4.0.md`.

## Event identity and validation

- Emit CloudEvents 1.0 structured JSON and JSON batches, signed with Standard Webhooks.
- Require Payload producers to configure one stable absolute-URI `source`; never infer a shared
  package default.
- Preserve `com.klnap.revalidation.resource.changed.v1` as the built-in resource-change event type.
- Resolve Standard Schema V1 validators by CloudEvents `type`, not by `source`.
- Always register the built-in resource-change schema. Reject custom attempts to replace it.
- Accept optional `allowedSources` as an exact source-URI allowlist.
- Authenticate the request, parse the full event envelope, enforce source restrictions, and validate
  every event's data before running rules or side effects.
- Treat `(source, id)` as event identity. Suppress repeated identities within one request; equal IDs
  from different sources remain independent events.

## Consumer API

`defineRevalidation()` provides the framework-independent built-in resource-change schema without
configuration. Resource-key mappings use typed template references and expand over validated
affected resources, including previous and current identifiers:

```ts
defineRevalidation({
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

Applications add custom event schemas by type when they need a different contract:

```ts
defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  schemas: {
    'com.example.pricing.changed.v1': pricingSchema,
  },
  rules: ({ on, tags }) => [
    on({ type: 'com.example.pricing.changed.v1' }, ({ data }) => ({
      tags: data.key === 'pricing' ? [tags.pricing()] : [],
    })),
  ],
})
```

Selectors may still match `source`, including alongside `type`. Schema selection is independent of
source identity. Declarative resource-key rules, typed tag/path references, grouping, resolver rules,
and named custom execution share one bounded planning and execution pipeline. Missing template
parameters are reported as incomplete invalidation; expanded cache and custom operations count
toward the configured operation limit.

The Next.js consumer accepts native cache profiles through `profile` at configuration and rule
levels, or `[tag, profile]` per tag. Precedence is tuple, rule, configuration, then `{ expire: 0 }`.
Conflicting effective profiles for the same tag reject the request before side effects. Paths accept
concrete URL strings, interpolated typed references, or `[literalRoutePattern, 'page' | 'layout']`
tuples; route patterns are never interpolated, and concrete URLs receive no inferred route type.

The built-in event type and schema are exported from the package root as
`resourceChangedEventType` and `resourceChangedSchema`. Payload-specific constants are not needed
to consume the standard contract.

## Payload producer API

```ts
import { http } from '@klnap/revalidation/dispatchers/http'

revalidation({
  source: 'https://cms.example/payload',
  dispatcher: http({
    targets: {
      website: { url: process.env.REVALIDATION_URL!, secret: process.env.REVALIDATION_SECRET! },
    },
  }),
})
```

The configured source is propagated through collection, global, deferred, media-dependent, and
orderable dispatch paths. The producer accepts the framework-independent `Dispatcher` contract;
the application constructs the built-in HTTP dispatcher separately. The producer preserves the built-in event type and
resource-change data shape.

## Migration from 0.4.0

- Add a stable absolute-URI `source` to every `revalidation()` plugin configuration.
- Remove imports and configuration for `payloadSource`; the old implicit
  `urn:klnap:revalidation:payload` identity is not retained.
- Replace consumer `sources` maps with `schemas` maps keyed by CloudEvents `type`.
- Remove the built-in Payload schema registration; it is always available.
- Change type-narrowing selectors from `{ source }` to `{ type }` where they select a schema.
- Add `allowedSources` when a consumer must restrict which producers may send otherwise valid event
  types.
- Keep `source` selectors when source-specific rule behavior is needed.
