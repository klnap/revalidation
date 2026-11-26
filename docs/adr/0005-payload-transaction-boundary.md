# ADR-0005: Payload hook and transaction boundary

## Status

Accepted for the 0.4.0 redesign.

## Context

Payload collection and global lifecycle hooks run before the operation commits. The current producer
uses a one-second timer when no explicit deferral exists. That timing is best-effort, not a commit
notification, and an operation may still fail or roll back after a hook runs.

## Decision

- Keep the ordinary Payload plugin direct and fail-open.
- Describe hook-triggered delivery as best-effort. A timer must not be called or documented as
  post-commit behavior.
- Preserve the internal deferral mechanism used by `revalidationOrderableHooks()`. It flushes when
  the host calls `onCommitted` and discards when the host calls `onRolledBack`.
- State that this package tests its callback behavior, not the host's transaction ordering. Do not
  claim post-commit behavior without an integration test against the host version in use.
- Do not expose a generic caller-owned transaction API without an explicit requirement.
- Do not monkey-patch Payload transaction functions or add a database-specific outbox.
- Do not claim durable, exactly-once, or generic post-commit delivery.

## Consequences

The quick start remains small and requires no new database schema. Applications that require
commit-ordered delivery must own the transaction boundary and use explicit deferral or an
application-managed outbox. A later failure may leave an invalidation for data that did not commit;
the receiver must treat revalidation as repeatable and re-read authoritative content.

## Evidence

Payload `3.94.1` source calls collection `afterChange`, `afterDelete`, and global `afterChange` before
`commitTransaction`. `afterOperation` also runs before commit. Transaction behavior depends on the
database adapter; SQLite transactions are disabled by default.

The `@klnap/payload-orderable` reorder integration test passed against disposable PostgreSQL. Its
endpoint starts its own transaction, commits before `onCommitted`, and rolls back before
`onRolledBack`. It rejects an existing outer transaction before callback handling. This verifies
that endpoint's callback order, not generic Payload hooks or the revalidation adapter's end-to-end
dispatch behavior. A failure in `onCommitted` is logged and swallowed after the reorder commits.

- [Payload `v3.94.1` collection create](https://github.com/payloadcms/payload/blob/283642340c459ede2a08d50240519eda9cb5b0cb/packages/payload/src/collections/operations/create.ts)
- [Payload `v3.94.1` global update](https://github.com/payloadcms/payload/blob/283642340c459ede2a08d50240519eda9cb5b0cb/packages/payload/src/globals/operations/update.ts)
- [Payload `v3.94.1` transaction docs](https://github.com/payloadcms/payload/blob/283642340c459ede2a08d50240519eda9cb5b0cb/docs/database/transactions.mdx)
- Installed package: `payload@3.94.1`, under `node_modules/payload/dist/`
