# Contributing

Bug reports and focused pull requests are welcome. Open an issue first for new features, because the package scope is deliberately small.

## Setup

Requires Bun and Node `^22.23.5 || ^24.22.3 || >=26.13.1`.

```sh
bun install --frozen-lockfile
bun run lint && bun run typecheck && bun run knip && bun run check:boundaries && bun test && bun run build && bun run check:package
```

Tests include a Payload integration test against a temporary SQLite database. Behavior changes need a test.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org). Add a `CHANGELOG.md` entry for user-visible changes.

## Releases

Maintainers only. Tag `vX.Y.Z` on `main` after a `chore: release X.Y.Z` pull request; `.github/workflows/release.yml` validates and publishes.
