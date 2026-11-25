# Architecture

The package separates event production, delivery, interpretation, and cache invalidation:

```text
Producer → Dispatcher → Consumer → Cache layers
                           └─ Source validation and event-to-key mapping
```

- **Producer:** creates event envelopes when its system changes. Payload CMS is the built-in producer.
- **Dispatcher:** delivers envelopes. HTTP is the built-in dispatcher; other implementations can satisfy the dispatcher contract.
- **Consumer:** authenticates and processes envelopes, matches resolved keys to rules, and executes invalidation.
- **Source:** defines and validates event items, then maps each item to a key used by the consumer's rules. Payload's wire format is the built-in source.
- **Cache layer:** performs invalidation. The Next.js layer is built in; custom layers can invalidate other caches.
- **Core:** provides framework-independent event, source, dispatcher, and pipeline contracts.

## Event flow

1. A producer emits `{ source, data }`, with one item or an array of items.
2. A dispatcher sends the envelope to a consumer. The built-in HTTP dispatcher sends one request per event.
3. The consumer authenticates the request and checks its body and item limits.
4. The named source validates each item and resolves its cache key.
5. Matching rules render declared tag and path helpers from item parameters.
6. The selected cache layers run. The built-in Next.js layer calls `revalidateTag` and `revalidatePath`.

## Independent roles

- Use the **consumer** without Payload by sending compatible events from any system. Configure a source for the event shape, or use the simple rule form when schema validation is not needed.
- Use the **Payload producer** with the built-in HTTP dispatcher and a Next.js consumer.
- Use the **core** contracts with a custom dispatcher or consumer integration.

Payload lifecycle code and internal helpers are not public extension points. See [supported extensions](../extending.md).

## Boundaries

The producer and consumer meet at the event envelope. Their source name, item fields, and key mapping must agree. Changing a Payload event field requires a matching consumer source or rule.

The built-in components do not include integrations for other CMSs, transports, frameworks, or cache vendors. Those systems can integrate through the documented producer, source, dispatcher, and cache-layer contracts.
