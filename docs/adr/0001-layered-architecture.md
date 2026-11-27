# ADR-0001: Layered architecture (@klnap/revalidation)

## Status

Accepted

## Context

Cache revalidation spans CMS producers, transport dispatchers, and Next.js consumers. Shared types and pipeline logic must stay free of framework imports so hosts can tree-shake and enforce boundaries.

## Decision

Organize `src/` as ports/adapters:

| Layer | Role | May import from `src` | Forbidden npm (runtime) |
| :--- | :--- | :--- | :--- |
| `core` | Protocol contracts, event validation and neutral utilities | `core` only | `payload`, `next` |
| `producers/payload` | Payload plugin, lifecycle hooks, media dependents | `core`, `producers/payload` | `next` |
| `dispatchers/http` | HTTP delivery with dispatcher-bound targets | `core`, `dispatchers/http` | `payload`, `next` |
| `consumers/next` | Next Route Handler and cache operations | `core`, `consumers/next` | `payload` |

Additional rules:

- Producers, dispatchers, and consumers never import each other.
- Under `producers/payload`, `lifecycle/` may import `media/`. `media/` may import `lifecycle/helpers.ts` (the barrel), `exclude-fields.ts` and `revalidation-custom.ts`; it must not import other `lifecycle/` files. Enforced by `check:boundaries`.

Enforcement: `bun run check:boundaries` (`dependency-cruiser.config.mjs`).

## Where new code goes

| Kind of change | Location |
| :--- | :--- |
| New CMS collection/global hook (non-media) | `producers/payload/lifecycle/` |
| Media upload dependents | `producers/payload/media/` |
| New transport | `dispatchers/<transport>/` |
| Next consumer behavior | `consumers/next/` |

## Consequences

- Producers receive the framework-independent dispatcher contract and do not construct transports.
- HTTP targets are captured by each dispatcher instance; no process-wide target state exists.
- Hosts import only documented `package.json` export subpaths.
