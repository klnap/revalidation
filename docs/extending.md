# Extending revalidation

The package exposes extension points for compatible producers, sources, dispatchers, and cache layers. Use documented package exports; internal files are not public API.

## Supported extension points

- **Custom producer:** Send the consumer an event envelope with a declared source and compatible item data.
- **Custom source:** Define a Valibot schema, item preparation, key resolver, and optional template-parameter resolver. See [custom sources](sources/custom.md).
- **Custom dispatcher:** Implement `dispatch({ events, deduplicationId? })` and return a `DispatchOutcome`. Pass it to the Payload producer or use it with the core pipeline.
- **Custom cache layer:** Add a layer to the consumer rules and provide its `execute` handler. See [Next.js custom cache layers](consumers/next.md#custom-cache-layers).
- **Explicit consumer configuration:** Use `createRevalidationHandler(config)` or `createCache(config)` instead of the module registry. See [Next.js consumer](consumers/next.md#explicit-configuration).
- **Orderable Payload hooks:** Use the exported `revalidationOrderableHooks` integration.

The built-in integrations are Payload CMS for event production, the Payload event source, HTTP delivery, and Next.js cache invalidation. Other CMS, framework, and transport integrations are not included.

## Outside the supported surface

- Payload lifecycle internals and media reference discovery are not public extension points. Configure media references through Payload fields; see [media dependencies](producers/payload-media-dependencies.md).
- Consumer authentication and request limits are built in. Add platform middleware or controls when you need additional protection.
- `createPipeline` exposes the framework-independent pipeline, not the Next.js consumer's authentication, limits, response mapping, or cache execution. Use the documented consumer APIs for those behaviors.
