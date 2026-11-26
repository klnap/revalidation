# Extending revalidation

The package exposes extension points for compatible producers, sources, dispatchers, and consumers. Use documented package exports; internal files are not public API.

## Supported extension points

- **Custom producer:** Send the consumer an event envelope with a declared source and compatible item data.
- **Custom source:** Register a CloudEvents source URI and a Standard Schema V1 validator. See [custom sources](sources/custom.md).
- **Custom dispatcher:** Implement `dispatch({ events, targets? })` and return a `DispatchOutcome`. Pass it to the Payload producer.
- **Consumer configuration:** Use `defineRevalidation()` to declare source schemas, cache templates, rules, and the Route Handler.
- **Orderable Payload hooks:** Use the exported `revalidationOrderableHooks` integration.

The built-in integrations are Payload CMS for event production, the Payload event source, HTTP delivery, and Next.js cache invalidation. Other CMS, framework, and transport integrations are not included.

## Outside the supported surface

- Payload lifecycle internals and media reference discovery are not public extension points. Configure media references through Payload fields; see [media dependencies](producers/payload-media-dependencies.md).
- Consumer authentication and request limits are built in. Add platform middleware or controls when you need additional protection.
- Core pipeline internals are not public package exports. Use the documented producer, dispatcher, source, and consumer APIs.
