# ADR-0001: Layered architecture (@klnap/revalidation)

## Status

Accepted

## Context

Cache revalidation spans CMS producers, transport dispatchers, and Next.js consumers. Shared types and pipeline logic must stay free of framework imports so hosts can tree-shake and enforce boundaries.

## Decision

Organize `src/` as ports/adapters:

| Layer | Role | May import from `src` | Forbidden npm (runtime) |
| :--- | :--- | :--- | :--- |
| `core` | Types, pipeline, target registry | `core` only | `payload`, `next` |
| `producers/payload` | Payload plugin, lifecycle hooks, media dependents | `core`, `producers/payload` | `next` |
| `dispatchers/routing` | Target resolution (plugin + factory precedence) | `core` | `payload`, `next` |
| `dispatchers/http` | Synchronous HTTP delivery | `core`, `dispatchers/routing` | `payload`, `next` |
| `consumers/next` | Next route handler + cache inspect | `core`, `sources/payload` (wire schema only) | `payload` |

Additional rules:

- Producers, dispatchers, and consumers never import each other.
- Sibling dispatchers never import each other; shared code lives in `routing/` or `core/`.
- Under `producers/payload`, `lifecycle/` may import `media/`. `media/` may import `lifecycle/helpers.ts` (the barrel), `exclude-fields.ts` and `revalidation-custom.ts`; it must not import other `lifecycle/` files. Enforced by `check:boundaries`.

Enforcement: `bun run check:boundaries` (`dependency-cruiser.config.mjs`).

## Where new code goes

| Kind of change | Location |
| :--- | :--- |
| New CMS collection/global hook (non-media) | `producers/payload/lifecycle/` |
| Media upload dependents | `producers/payload/media/` |
| New transport | `dispatchers/<transport>/` + use `routing/` for targets |
| Shared target / plugin state | `core/` (`revalidation-target`, `plugin-target`) |
| Next consumer behavior | `consumers/next/` |

## Consequences

- Producers never import dispatchers; the dispatcher is passed to `revalidation({ dispatcher })`.
- Hosts import only documented `package.json` export subpaths.
