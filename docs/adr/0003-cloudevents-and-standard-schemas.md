# ADR-0003: CloudEvents and Standard Schema

## Status

Accepted for the 0.4.0 redesign.

## Context

The current `{ source, data }` envelope is package-specific. It does not identify an individual
event or define interoperable single-event and batch formats. Source validators are tied to
Valibot's runtime schema type, and the consumer processes validator inputs rather than a standard
transformed output contract.

## Decision

- Use CloudEvents 1.0 structured JSON events and JSON batches.
- Use `application/cloudevents+json` for one event and
  `application/cloudevents-batch+json` for a batch.
- Require and validate CloudEvents `id`, `source`, `specversion`, and `type`.
- Generate `rev_`-prefixed IDs and preserve IDs across retries.
- Define the package's resource-change profile in `docs/specification/0.4.0.md`.
- Use Standard Schema V1 for application `data` schemas. Await sync or async validation and use the
  returned output value.
- Keep envelope validation separate from application-schema validation.
- Implement only the JSON event and batch profile. Do not add a CloudEvents SDK dependency unless
  the package later needs broader formats or protocol bindings.
- Use `@standard-schema/spec` for the public Standard Schema V1 type and `standardwebhooks` for
  signing and verification. Pin compatible versions through the package lockfile.

## Consequences

The package gains interoperable event IDs, source identity, content types, and batch framing. Its
own event profile still requires documentation and conformance tests. The JSON-only profile avoids
the CloudEvents SDK's broader dependency graph and its declared Node `<=24` engine range; it must
not claim support for binary bindings or non-JSON data.

Standard Schema validators may be asynchronous and may transform data. Runtime execution must
await them and pass their output to selectors and rules.

## References

- [CloudEvents 1.0.2 core specification](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
- [CloudEvents 1.0.2 JSON format](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md)
- [Standard Schema V1](https://standardschema.dev/)
- [CloudEvents JavaScript SDK](https://github.com/cloudevents/sdk-javascript)
- [Standard Webhooks JavaScript implementation](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/javascript)
