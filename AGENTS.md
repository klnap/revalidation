# Package development and release policy

These rules apply to all work in this repository. Use GitHub Flow: branch from current `origin/main`, keep task branches short-lived, use Conventional Commits, and squash-merge verified pull requests. Reuse an existing branch or pull request when continuing its work.

## Ownership and autonomy

The repository owner authorizes the agent to complete the package development and release lifecycle without repeated approval for routine steps. This includes creating and managing task branches, implementing and verifying changes, committing and pushing, opening and updating pull requests, approving eligible GitHub Actions workflow runs, merging verified pull requests, managing Changesets, reviewing and merging generated Release PRs, completing npm Trusted Publishing through GitHub Actions, verifying publication, and synchronizing local branches.

Preserve unrelated user changes. Follow repository protections. Never force-push, indiscriminately reset the worktree, or bypass security controls.

## Implementation lifecycle

For a completed implementation that warrants a release:

1. Inspect the repository, current work, and pending Changesets.
2. Implement the requested scope; run focused tests, independent review, and package validation.
3. Update user-facing documentation and add a SemVer Changeset for consumer-visible impact.
4. Commit and push the task branch, then create or update its pull request.
5. Wait for required checks. Investigate failures and resolve material findings.
6. Merge with the configured strategy. Monitor main-branch CI and Changesets.
7. Review the generated Release PR's complete diff, release scope, versions, and changelog.
8. Approve eligible pending workflow runs after confirming their source and scope. Wait for required checks, then merge the Release PR.
9. Monitor artifact verification and npm Trusted Publishing. Confirm the expected version independently in the npm registry.
10. Verify the npm dist-tag, provenance where supported, Git tag, and GitHub Release. Synchronize local `main` and safely clean up only completed task branches.

Do not report a release as successful until npm registry publication is independently verified.

## Release safeguards

Changesets is the sole versioning and release-management mechanism. Never manually bump package versions, create release tags, publish locally, or add long-lived npm publishing tokens. Do not create releases for infrastructure-only changes. Preserve the build-once, verify, publish architecture. Inspect all pending Changesets before publishing; include only authorized release scope.

Use `~/code/packages/npm-package-template` as the source of truth for shared engineering and release infrastructure. Keep this package's existing engineering requirements, including its contribution and validation guidance.

## Scope and stop conditions

Explicit task restrictions such as local-only, push-only, no merge, no release, or no publication override the default lifecycle for that task. Research, investigation, design discussions, and unfinished implementations do not trigger releases.

Stop and report a genuine blocker: missing permissions or interactive authentication; unresolved security vulnerabilities or failing required checks; conflicting user changes; unexpected release content; an architectural decision requiring the owner's input; or a platform restriction that cannot be resolved without bypassing security controls. Do not repeat successful checks unnecessarily or expand scope through refactoring.
