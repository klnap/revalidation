# ADR-0002: Public surface and dispatcher contract

## Status

Superseded by ADRs 0003–0005 and the current candidate specification.

## Public subpaths

Defined in `package.json` `exports` (do not deep-import `src/`):

| Subpath | Purpose |
| :--- | :--- |
| `@klnap/revalidation` | CloudEvents, the framework-independent resource-change contract, selectors, errors, and dispatcher types |
| `@klnap/revalidation/producers/payload` | `revalidation()` Payload plugin |
| `@klnap/revalidation/consumers/next` | `defineRevalidation` |
| `@klnap/revalidation/dispatchers` | Barrel (prefer transport subpaths for tree shaking) |
| `@klnap/revalidation/dispatchers/http` | HTTP dispatcher only |

The package manifest defines the explicit public export map.

Exports point to compiled `dist/` entry points. Run `bun run build` before packing; the package lifecycle does not rebuild them. CI verifies the built output and packs that same artifact, preventing a second build during release preparation.

## Dispatcher contract

The historical export and dispatcher contract was replaced by the CloudEvents contract in ADRs
0003–0005. See `docs/specification/vnext.md` and the package manifest for the current surface.

## Peer dependencies

`payload` and `next` are optional peer dependencies. `@standard-schema/spec` defines the schema
interface; Valibot provides the built-in Payload schema.

## Runtime

`@klnap/revalidation/consumers/next` uses `crypto.randomUUID()` (Web Crypto). Route handlers follow the host’s Next/Payload runtime.
