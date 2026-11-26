# Architecture

The package separates event production, delivery, event validation, and cache invalidation:

```text
Producer → Dispatcher → Consumer → Cache invalidation
                           └─ CloudEvent and source validation
```

- **Producer:** creates event envelopes when its system changes. Payload CMS is the built-in producer.
- **Dispatcher:** delivers envelopes. HTTP is the built-in dispatcher; other implementations can satisfy the dispatcher contract.
- **Consumer:** authenticates and validates events, matches rules, and executes invalidation.
- **Source:** a CloudEvents source URI paired with a Standard Schema V1 validator for event data.
- **Core:** provides framework-independent CloudEvents, selector, schema, and dispatcher contracts.

## Event flow

1. A producer emits a CloudEvent or an ordered CloudEvents batch.
2. A dispatcher sends matching events to named destinations.
3. The consumer authenticates the request and checks its body and item limits.
4. The registered source schema validates every event's `data`.
5. Matching rules render declared tag and path helpers from validated resources.
6. The Next.js consumer calls `revalidateTag` and `revalidatePath`.

## Independent roles

- Use the **consumer** without Payload by sending CloudEvents from any system. Register its source URI and data schema.
- Use the **Payload producer** with the built-in HTTP dispatcher and a Next.js consumer.
- Use the **core** event contracts with a custom dispatcher or consumer integration.

Payload lifecycle code and internal helpers are not public extension points. See [supported extensions](../extending.md).

## Boundaries

The producer and consumer meet at the CloudEvent. The consumer must register the same source URI and validate the producer's data profile.

The built-in components do not include integrations for other CMSs, transports, frameworks, or cache vendors. Those systems can integrate through documented producer, source, dispatcher, and consumer contracts.
