# Changelog

## [0.1.0] - 2026-11-24

First public release.

- Core pipeline (`@klnap/revalidation`) with framework-independent types, errors, and dispatcher contract.
- Payload producer (`@klnap/revalidation/producers/payload`): the `revalidation()` plugin emits events from `afterChange` and `afterDelete` hooks on collections and globals that set `custom.revalidation`. Handles locales, drafts, publish-all, orderable neighbors, media dependents, and excluded fields.
- HTTP dispatcher (`@klnap/revalidation/dispatchers/http`) with bearer secret, retries, deadline, and bounded concurrency.
- Next.js consumer (`@klnap/revalidation/consumers/next`): `defineRevalidation`, `createCache`, and a `POST` route handler that expires or revalidates cache tags and paths.
