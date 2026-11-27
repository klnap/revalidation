# Extending revalidation

The package supports compatible producers and dispatchers through public contracts. Custom
consumers can compose exported protocol primitives, but the package does not provide a generic
consumer factory. Use documented package exports; internal files are not public API.

## Supported extension points

- **Custom producer:** Emit the built-in resource-change CloudEvent or a custom event type. See [custom producers](producers/custom.md).
- **Custom dispatcher:** Implement the public `Dispatcher` contract. See [custom dispatchers](dispatchers/custom.md).
- **Custom consumer:** Implement authentication, limits, rules, and cache operations around exported protocol primitives. See [custom consumers](consumers/custom.md).
- **Next.js consumer configuration:** Use `defineRevalidation()` to declare event schemas, cache templates, rules, and the Route Handler.
- **Orderable Payload hooks:** Use the exported `revalidationOrderableHooks` integration.

The built-in integrations are Payload CMS for event production, HTTP delivery, and Next.js cache
invalidation. Other CMS, framework, transport, and cache integrations are not included.

## Custom execution: commerce indexing

The application owns commerce indexing. The executor receives `value` as `unknown`, so validate
its shape before passing it to application code:

```ts
import { resourceChangedEventType } from '@klnap/revalidation'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

declare function updateProductIndex(
  ids: string[],
  options: { signal: AbortSignal },
): Promise<void>

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string')

export const { POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  rules: ({ on }) => [
    on(
      {
        type: resourceChangedEventType,
        affected: { type: 'payload.collection', name: 'products' },
      },
      ({ affected }) => ({
        operations: [{
          layer: 'index',
          value: affected.flatMap(({ resource }) => resource.id ? [resource.id] : []),
        }],
        tags: ['products'],
      }),
    ),
  ],
  execute: {
    index: async ({ value, signal }) => {
      if (!isStringArray(value)) throw new TypeError('Expected product IDs.')
      await updateProductIndex(value, { signal })
    },
  },
})
```

Return the indexing operation and dependent invalidation from the same rule. A failed index
operation skips that rule's cache invalidation; unrelated rules continue. The executor is awaited
within the request, receives a cooperative `AbortSignal`, and is not a durable background job.
`updateProductIndex()` is application-owned. See the [Next.js consumer guide](consumers/next.md#custom-cache-operations).

## Outside the supported surface

- Payload lifecycle internals and media reference discovery are not public extension points.
  Configure media references through Payload fields; see [media dependencies](producers/payload-media-dependencies.md).
- The built-in Next.js consumer handles authentication and request limits. Custom consumers must
  provide their own controls.
- Internal implementation modules are not public package exports. Use the documented producer,
  dispatcher, event contract, and consumer APIs.
