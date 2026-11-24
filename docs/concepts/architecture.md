# Architecture

`@klnap/revalidation` separates four roles. Each role has a defined contract, and each can be used without the others.

| Role | Responsibility | Built-in implementation | Import |
| --- | --- | --- | --- |
| **Producer** | Emits an event when content changes. | Payload CMS plugin | `@klnap/revalidation/producers/payload` |
| **Source** | Defines the event item format, validates items, and maps each item to a cache key. | Payload wire format | `@klnap/revalidation/sources/payload` |
| **Dispatcher** | Delivers events from a producer to a consumer. | HTTP | `@klnap/revalidation/dispatchers/http` |
| **Consumer** | Matches events to rules, builds cache tags and paths, and invalidates them. | Next.js route handler | `@klnap/revalidation/consumers/next` |
| **Core** | Framework-independent types, errors and pipeline logic shared by the others. | — | `@klnap/revalidation` |

## Event flow

1. A producer emits an event: `{ source, data: [item, ...] }`. Items are plain objects.
2. A dispatcher sends the event to a consumer. The built-in HTTP dispatcher sends one `POST` per event.
3. The consumer authenticates the request, parses the body, and checks the limits.
4. For each item, the source validates the shape and resolves a cache key (for example `pages`).
5. Rules whose key matches that cache key select tags and paths. Tag templates are rendered with parameters from the item.
6. Layers execute the invalidation: the built-in `next` layer calls `revalidateTag` and `revalidatePath`; custom layers run your `execute` handler.

## Which parts can be used alone

- **Consumer only.** Send the event envelope yourself, with a bearer token, from any system. You need a source for your item shape. See [custom sources](../sources/custom.md).
- **Consumer and Payload producer.** The default setup in the README.
- **Core and a custom dispatcher.** Core provides the pipeline; you provide transport.

Dispatchers, sources and layers are the extension points. Producers are implemented by Payload; a custom producer can send the same envelope over HTTP, but the Payload lifecycle helpers are internal. See [extending](../extending.md).

## Coupling between components

- The producer and the consumer meet only at the wire format: the `source` name and the item shape. Changing a field name in the Payload item (`key`, `locale`, `slug`, …) requires a matching rule or source on the consumer.
- The consumer's full DSL selects tag parameters through the source definition. Replacing the schema of a source can change which parameters are available.
- Plugin dispatcher targets are stored per process. A second Payload configuration in the same process replaces the first target.
