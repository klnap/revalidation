# ADR-0002: Public surface and dispatcher contract

## Status

Accepted

## Public subpaths

Defined in `package.json` `exports` (do not deep-import `src/`):

| Subpath | Purpose |
| :--- | :--- |
| `@klnap/revalidation` | Core pipeline, errors, target registry, `aggregateDispatchOutcomes` |
| `@klnap/revalidation/sources/payload` | Canonical Payload item schema + `payloadRevalidationSource()` |
| `@klnap/revalidation/producers/payload` | `revalidation()` Payload plugin |
| `@klnap/revalidation/consumers/next` | `createRevalidationHandler`, `createCache` |
| `@klnap/revalidation/dispatchers` | Barrel (prefer transport subpaths for tree shaking) |
| `@klnap/revalidation/dispatchers/http` | HTTP dispatcher only |

The package manifest defines the explicit public export map.

Workspace and published exports point to compiled `dist/` entry points. The `prepack` lifecycle builds those files before packaging.

## Dispatcher contract

Every transport implements `Dispatcher.dispatch()` and **returns** `DispatchOutcome` (never throws).

Semantics: `accepted` | `rejected` | `failed` | `unknown` — see `core/types.ts`.

## Peer dependencies

`payload`, `next` (optional per layer), `valibot` (required for pipeline + Payload source schema).

## Runtime

`@klnap/revalidation/consumers/next` uses `crypto.randomUUID()` (Web Crypto). Route handlers follow the host’s Next/Payload runtime.
