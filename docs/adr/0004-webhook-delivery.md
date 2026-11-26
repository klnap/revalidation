# ADR-0004: Named HTTP delivery and Standard Webhooks

## Status

Accepted for the 0.4.0 redesign.

## Context

The current HTTP dispatcher accepts one unnamed bearer-token destination or a list of destinations
without stable names. Its custom authentication scheme does not bind a delivery ID and timestamp to
the exact request body.

The redesign needs multiple named delivery destinations, destination-specific filtering, partial
outcomes, and safe direct delivery without a persistent queue.

## Decision

- Make HTTP the default transport.
- Configure destinations in `dispatcher.targets`, keyed by stable application names.
- Send every event to every configured destination by default.
- Allow optional per-target event filters. Keep their selector semantics separate from consumer
  cache rules.
- Allow explicit target selection only as a manual-dispatch override. Intersect it with target
  filters; never let it bypass a filter.
- Filter each destination's events before chunking. Sign one CloudEvents event or batch per chunk.
- Sign the exact serialized body with Standard Webhooks using each destination's secret.
- Verify raw request bytes before parsing JSON.
- Reuse body bytes and delivery ID for retries of one target chunk. Generate a fresh timestamp and
  signature for every attempt so timestamp freshness remains meaningful. Give every target chunk an
  independent delivery ID.
- Bound concurrency, timeout, retries, event and body sizes, and total dispatch time.
- Continue delivery to other destinations after one fails. Return per-destination outcomes and an
  aggregate `partial` result when outcomes differ. Return `unknown` before `rejected` or `failed`
  when no chunk succeeds and an outcome may have reached its receiver.
- Do not add a durable queue, broker, or replay database. Document duplicate delivery and loss
  limits.

## Consequences

Each destination owns a secret and reports an independent outcome. Adding a destination does not
change producer logic. Filters allow a producer to remain independent of destination names and
topology.

Standard Webhooks secrets use the `whsec_`-prefixed Base64 format. Existing bearer-token targets
must migrate. Signature verification limits replay by timestamp but does not provide persistent
deduplication; consumers with non-idempotent effects must store delivery IDs.

## References

- [Standard Webhooks specification](https://github.com/standard-webhooks/standard-webhooks)
- [Standard Webhooks JavaScript implementation](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/javascript)
