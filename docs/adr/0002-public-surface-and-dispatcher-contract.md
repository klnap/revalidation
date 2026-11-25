# ADR-0002: Public surface and dispatcher contract

## Status

Accepted

## Public subpaths

Defined in `package.json` `exports` (do not deep-import `src/`):

| Subpath | Purpose |
| :--- | :--- |
| `@klnap/revalidation` | Core pipeline, errors, dispatch outcome helpers |
| `@klnap/revalidation/sources/payload` | Canonical Payload item schema + `payloadRevalidationSource()` |
| `@klnap/revalidation/producers/payload` | `revalidation()` Payload plugin |
| `@klnap/revalidation/consumers/next` | `defineRevalidation`, `invalidKey` |
| `@klnap/revalidation/consumers/next/tags` | Cache tag and path helper generation |
| `@klnap/revalidation/dispatchers` | Barrel (prefer transport subpaths for tree shaking) |
| `@klnap/revalidation/dispatchers/http` | HTTP dispatcher only |

The package manifest defines the explicit public export map.

Exports point to compiled `dist/` entry points. The `prepack` lifecycle builds those files before packaging.

## Dispatcher contract

Every transport implements `Dispatcher.dispatch()` and **returns** `DispatchOutcome` (never throws).

Semantics: `accepted` | `rejected` | `failed` | `unknown` — see `core/types.ts`.

## Peer dependencies

`payload` and `next` are optional peer dependencies. `valibot` is a runtime dependency of the package (pipeline and wire schemas).

## Runtime

`@klnap/revalidation/consumers/next` uses `crypto.randomUUID()` (Web Crypto). Route handlers follow the host’s Next/Payload runtime.
