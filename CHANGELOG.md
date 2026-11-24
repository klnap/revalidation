# Changelog

## [Unreleased]

### Fixed

- A `null` template parameter no longer renders the tag text `null`. Direct tag calls throw, and events skip the tag.
- An event whose field is `null` no longer fails with a `TypeError` (HTTP 500).
- After `defineRevalidation` is called again (development reload), the Route Handler uses the new declarations.
- Media-triggered events carry the parent document's route identifier and identifier values, not only its slug.
- A read error while building a Payload event is logged and no longer rejects the save.
- A layer that has no `execute` handler and is not `next` fails the request with `500`, instead of running Next revalidation.
- Items skipped for a missing template parameter are logged as `missing_param` when a logger is configured.

### Changed

- The boundary check (`check:boundaries`) analyses modules again; it had analysed zero modules with TypeScript 7.
- Documentation rewritten around the architecture; see `docs/`.

## [0.1.0] - 2026-11-24

First public release.

- Core pipeline (`@klnap/revalidation`) with framework-independent types, errors, and dispatcher contract.
- Payload producer (`@klnap/revalidation/producers/payload`): the `revalidation()` plugin emits events from `afterChange` and `afterDelete` hooks on collections and globals that set `custom.revalidation`. Handles locales, drafts, publish-all, orderable neighbors, and excluded fields. Media-dependent revalidation finds the documents that reference a changed or deleted media file from the Payload config and revalidates them.
- HTTP dispatcher (`@klnap/revalidation/dispatchers/http`) with bearer secret, retries, deadline, and bounded concurrency.
- Next.js consumer (`@klnap/revalidation/consumers/next`): `defineRevalidation`, `createCache`, and a `POST` route handler that expires or revalidates cache tags and paths.
