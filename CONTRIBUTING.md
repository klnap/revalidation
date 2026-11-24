# Contributing

Bug reports and focused pull requests are welcome. Open an issue first for new features, because the package scope is deliberately small.

## Setup

Requires Bun and Node `^22.23.5 || ^24.22.3 || >=26.13.1`.
TypeScript consumers need TypeScript `>=5.0`.

```sh
bun install --frozen-lockfile
bun run lint && bun run typecheck && bun run knip && bun run check:boundaries && bun test && bun run build && bun run check:package
```

`bun run typecheck` builds the package and checks public declarations through its export paths. `bun test` runs unit, contract, and temporary SQLite integration tests. Behavior changes need a regression test.

`scripts/consumer-smoke.sh <tarball>` installs the built artifact in a clean project, exercises the Payload producer, and verifies real Next.js production cache invalidation, including a chunked oversized-body response. CI runs it against the current pinned integration versions and the minimum Next.js version. The Node compatibility job covers each declared Node line.

CI runs focused request and Payload media regressions in a Docker container with verified memory, CPU, process, network, and read-only source limits. `workflow_dispatch` requires a full commit SHA and runs the non-publishing qualification checks against that revision. Fork pull requests scan locally without SARIF upload; trusted pushes upload results with `security-events: write`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org). Add a `CHANGELOG.md` entry for user-visible changes.

## Releases

Maintainers only. Tag `vX.Y.Z` on `main` after a `chore: release X.Y.Z` pull request; `.github/workflows/release.yml` validates and publishes. npm Trusted Publishing and provenance eligibility must be configured by repository owners; CI does not test those external settings.
