# Custom consumers

The package does not provide a framework-independent consumer factory. Its built-in consumer is
the Next.js Route Handler; another framework or cache vendor needs an application-owned request
handler and execution pipeline.

The package root exports protocol primitives for custom consumers:

- `parseCloudEvents` parses one CloudEvent or an ordered CloudEvents batch.
- `validateStandardSchema` validates event data with a Standard Schema V1 schema.
- `resourceChangedSchema` and `resourceChangedEventType` describe the built-in resource-change
  contract.
- `matchesEventSelector` and `matchingAffectedResources` support selector and resource matching.

A custom consumer must implement its own authentication, request-size and item limits, source
policy, schema lookup by CloudEvents `type`, rule resolution, and cache operations. Authenticate
before parsing or running side effects. If receiving HTTP deliveries, verify the raw request bytes
with Standard Webhooks; do not parse and reserialize the body before signature verification.

The [event contract](../concepts/event-contract.md) documents the shared protocol. For the
complete built-in behavior, including authentication and request limits, see the
[Next.js consumer guide](./next.md).
