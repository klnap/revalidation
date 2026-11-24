# Extending revalidation

This page lists the extension points that are exported and tested. Anything else in `src/` is internal and may change.

## Supported

| Extension point | How | Verified by |
| --- | --- | --- |
| **Custom dispatcher** | Any object with `dispatch({ events, deduplicationId? })` returning a `DispatchOutcome`. Pass it as `dispatcher` to `revalidation()`, or as a `{ default, fallback }` pair. | `Dispatcher` type exported from `@klnap/revalidation`; `tests/unit/pipeline/http-producer-consumer.test.ts`; `scripts/consumer-smoke.sh` |
| **Custom source** | `sources` with `schema`, `resolve`, optional `prepare` and `params` (full DSL), or `resolve` in the simple form. | `tests/unit/consumers/next/standalone-source.test.ts`; [custom sources](sources/custom.md) |
| **Custom cache layer** | `execute: { <layer>: handler }` with layers named in `invalidate.layers` or `layers`. | `tests/unit/consumers/next/execute-paths.test.ts`; [Next.js consumer](consumers/next.md#custom-cache-layers) |
| **Custom consumer configuration** | `createCache` / `createRevalidationHandler` with a configuration object instead of the registry. | `tests/unit/consumers/next/` |
| **Custom transport** | A dispatcher (above). The HTTP dispatcher is one implementation, not part of the pipeline. | Dispatcher tests |

## Supported through the wire format

- **Custom producers.** Any system can send an event to the consumer: the envelope is a plain JSON object, and a source defines its items. This is the same path as a custom source. The Payload producer's lifecycle helpers are internal and are not an API.

## Not supported

- **Custom Payload hooks from outside the package.** The lifecycle helpers and the media reference list are internal. Extend discovery through your Payload config (see [media dependencies](producers/payload-media-dependencies.md)), not through the package.
- **Replacing the consumer's authentication or limits.** They are built in; wrap the route in your own middleware if you need more.
- **Custom consumers built on `createPipeline`.** It is exported, but it only inspects and resolves events. Authentication, limits, execution and response mapping live in `createCache`. Use `createCache` with a custom configuration instead.
- **Integrations that do not exist yet.** There is no built-in integration for other CMSs or frameworks.
