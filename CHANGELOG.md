# Changelog

## 0.5.2

### Patch Changes

- 5ca5026: Release workflow only: retry the pack artifact download once after a short wait, matching npm-package-template. No runtime change.

## 0.5.1

### Patch Changes

- cc59fe4: Report missing and malformed HTTP target signing secrets with the target name and a clear remediation, without echoing the secret value.

## 0.5.0

### Minor Changes

- 0090aca: Require explicit Payload CloudEvents sources, resolve consumer schemas by event type, and use native
  Next.js cache profiles and path scopes with optional source allowlists.

## 0.4.0

### Minor Changes

- 2c50b41: Replace the legacy consumer and event APIs with CloudEvents, Standard Schema validation, named HTTP targets, and composable cache rules. This release includes breaking public API changes.

## 0.3.0

### Minor Changes

- 1ba2679: Replace `invalidate` with declarative `rules` and context-based callbacks. Bind each `POST` handler to
  its configuration, remove process-wide target registries and obsolete exports, improve tag and path
  inference, and refresh the Next.js and Payload examples. This intentionally breaks the pre-1.0
  consumer and HTTP dispatcher APIs.

## [Unreleased]

## [0.2.2] - 2026-11-24

### Added

- `maxEventItems` option on the HTTP dispatcher (default 100, hardest allowed 1000). The producer splits change sets into events of this size, so a larger value lets one event carry more items.
- Consumer limits validated at configuration time against hard ceilings: `maxBodyBytes` up to 16 MiB and `maxEvents` up to 1000. Out-of-range values throw at startup. Defaults are unchanged.

## [0.2.1] - 2026-11-24

### Added

- `allowInsecure` option on the HTTP dispatcher (default `false`). When `true`, plain `http://` targets are accepted on any host; the bearer secret is then sent unencrypted.

### Changed

- The HTTP dispatcher accepts plain `http://` targets on loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) in every environment, so a local production build can reach a local receiver. Other plain `http://` targets are still refused outside `development` and `test`.

## [0.2.0] - 2026-11-24

### Breaking

- Stop exporting test-only reset functions and internal registry, lifecycle, and Next execution helpers. Use the documented producer and consumer APIs.

### Fixed

- Tag and path references must come from the active configuration, including low-effort declarations.
- Media dependency traversal uses stable ID cursors and preserves completed results when another query fails.
- Media dependency reads retain the current Payload hook request and transaction context.
- Oversized streamed requests return without waiting for stream cancellation to settle.
- Payload version-history lookup now scans beyond the first page.
- Include linked documentation in the packed package.

### Changed

- Cache tag helpers infer required parameters from literal templates.
- Production rejects a second, different `defineRevalidation` configuration instead of reusing stale declarations.

## [0.1.1] - 2026-11-24

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
