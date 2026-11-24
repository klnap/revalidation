# Sources and custom event sources

A source defines what an event item looks like, validates it, and maps it to a cache key. The consumer routes each item by its cache key to the rules you declare.

## Producer and source

A producer is what emits events (for example the Payload plugin). A source is what the consumer uses to read them. They are linked by the `source` name in the envelope. The Payload producer sends items with `source: 'payload'`, and the consumer's Payload source (`payloadRevalidationSource()`) reads them.

A custom event source is a source you define in the consumer. You can then send events from any system, with any item shape, to the same route.

## Event envelope

Every request to the consumer, and every event from the built-in dispatcher, has this shape:

```json
{
  "source": "webhook",
  "data": [{ "key": "pricing" }]
}
```

- `source` names the source. It must be declared (full DSL), or any name is accepted with the simple form, which routes it through `*`.
- `data` is one item or an array of items. Each item is validated separately.

## Defining a custom source

Use the full DSL with `sources` and `layers`. This is the complete example from the README, verified by `tests/unit/consumers/next/standalone-source.test.ts`:

```ts
import * as v from 'valibot';
import { defineRevalidation } from '@klnap/revalidation/consumers/next';

export const { tags } = defineRevalidation({
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

Then send an event:

```sh
curl -X POST https://example.com/api/revalidate \
  -H "Authorization: Bearer $REVALIDATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"webhook","data":[{"key":"pricing"}]}'
```

The consumer returns `200` and invalidates the `pricing` tag.

## Source fields

- `schema`: a [valibot](https://valibot.dev) schema. Items that fail it are skipped and logged (when a logger is configured). The request still succeeds.
- `resolve`: returns the cache key for an item. An empty key or `invalidKey()` skips the item.
- `prepare` (optional): returns extra fields that are merged into the item before `resolve`.
- `params` (optional): returns the template parameters for tags and paths.

`valibot` must be installed in the consumer application.

## Simple form

Without `sources`, `invalidate` accepts any source name:

```ts
defineRevalidation({
  secret,
  tags: { pricing: 'pricing' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (t) => ({ pricing: [t.pricing] }),
});
```

In this form only items that are not objects are skipped; there is no schema validation. Prefer the full DSL when items come from outside your system.

## Unknown sources and unmatched keys

- With the full DSL, an unknown `source` fails the whole request with `400 Unknown source: <name>`.
- An item whose cache key matches no rule is skipped; the request succeeds with `200`.
