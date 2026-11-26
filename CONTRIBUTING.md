# Contributing

Bug reports and focused pull requests are welcome. Open an issue first for new features, because the package scope is deliberately small.

## Setup

Requires Bun and Node `^22.23.5 || ^24.22.3 || >=26.13.1`.
TypeScript consumers need TypeScript `>=5.0`.

```sh
bun install --frozen-lockfile
bun run check
bun run test:integration
```

`bun run check` formats and lints the repository, typechecks source and public declarations, checks dependencies and module boundaries, runs unit and contract tests, builds the package, and validates its package metadata and types.

`bun run test:integration` runs Payload tests against SQLite. Behavior changes need a regression test.

To verify a packed package in a clean consumer, first build and pack it, then run `bun run test:consumer-smoke -- <tarball>`. The smoke test exercises the Payload producer and real Next.js production cache invalidation.

CI runs the unit, contract, Payload integration, and packed-consumer checks. It checks packed runtime imports on the minimum supported Node.js versions and runs the production Next.js smoke test on Node.js 24. Dependency and workflow scans run separately.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org). Add a `CHANGELOG.md` entry for user-visible changes.

## Releases

Maintainers only. Add a changeset for consumer-visible changes. After merge, `.github/workflows/release.yml` opens or updates the version pull request. Merge it to publish the verified tarball, create the Git tag, and create the GitHub Release.

npm Trusted Publishing must bind `klnap/revalidation`, `.github/workflows/release.yml`, and the `npm` environment. The publish job uses GitHub OIDC and requires no npm token. Repository owners must configure and verify this external setting; workflow checks alone do not prove it works.
