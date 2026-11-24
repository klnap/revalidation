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

`scripts/consumer-smoke.sh <tarball>` installs the built artifact in a clean project, exercises the Payload producer, and verifies real Next.js production cache invalidation, including a chunked oversized-body response. CI runs it against the current pinned integration versions.

CI runs tests, checks the package, and scans dependencies and workflows. Fork pull requests scan without SARIF upload; trusted pushes upload results with `security-events: write`. The CI workflow can also be run manually for a selected branch or tag.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org). Add a `CHANGELOG.md` entry for user-visible changes.

## Releases

Maintainers only. Tag `vX.Y.Z` on `main` after a `chore: release X.Y.Z` pull request; `.github/workflows/release.yml` validates and publishes. npm Trusted Publishing and provenance eligibility must be configured by repository owners; CI does not test those external settings.
