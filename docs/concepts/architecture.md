# Architecture

The package separates three integration roles around a framework-independent event contract:

```text
Producer → Dispatcher → Consumer → Cache invalidation
                           └─ CloudEvent and type-based schema validation
```

- **Producer:** creates event envelopes when its system changes. Payload CMS is built in; see
  [producer guides](../producers/payload.md) and [custom producers](../producers/custom.md).
- **Dispatcher:** delivers envelopes. HTTP is built in; other implementations can satisfy the public
  dispatcher contract. See [dispatcher guides](../dispatchers/http.md) and
  [custom dispatchers](../dispatchers/custom.md).
- **Consumer:** authenticates and validates events, matches rules, and executes invalidation.
  Next.js is built in; see [consumer guides](../consumers/next.md) and
  [custom consumers](../consumers/custom.md).
- **Source:** a producer's CloudEvents identity; optional consumer allowlists restrict accepted URIs.
- **Event type:** selects the Standard Schema V1 validator for event data.
- **Core:** exports framework-independent CloudEvents, schema, selector, and dispatcher contracts.
  See the [event contract](./event-contract.md).

## Event flow

1. A producer emits a CloudEvent or an ordered CloudEvents batch.
2. A dispatcher sends matching events to named destinations.
3. The consumer authenticates the request and checks its body and item limits.
4. The schema registered for each event type validates its `data`.
5. Matching rules render declared tag and path helpers from validated resources.
6. The Next.js consumer calls `revalidateTag` and `revalidatePath`.

## Independent roles

- Use the **Next.js consumer** without Payload by sending CloudEvents from any system. Register its event type's data schema.
- Compose the **Payload producer**, built-in HTTP dispatcher, and Next.js consumer in an application.
- Use the **core** event contracts with a custom producer, dispatcher, or consumer integration.

Producers report what changed. Consumers choose how their caches respond; producers do not need to
know how consumers store or invalidate data.

Payload lifecycle code and internal helpers are not public extension points. See [supported extensions](../extending.md).

## Boundaries

The producer and consumer meet at the CloudEvent. The producer sets its source identity; the
consumer validates data by event type and may allowlist sources.

The built-in components do not include integrations for other CMSs, transports, frameworks, or
cache vendors. Custom consumers must implement their own request handling, authentication, policy,
and execution; the package does not provide a generic consumer factory.
