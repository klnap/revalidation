# excludeFields — Payload revalidation producer

## 1. Problem Statement

CMS fields that do not affect the public frontend (admin labels, internal descriptions, media filenames) should not trigger HTTP revalidation dispatch. Hosts need declarative exclusions on collection/global schemas (like `identifier`) with optional plugin defaults.

## 2. Solution Overview

Extend `custom.revalidation` and `revalidation()` plugin config with `excludeFields: string[]`. Before dispatch, compare current vs previous locale document content with technical keys, volatile nested ids, and excluded paths stripped. Skip POST when equal. Identifier changes, delete, and draft→published always dispatch.

## 3. Scope

**In scope:**

- Precedence: explicit schema `excludeFields` **replaces** plugin list (no union).
- Collection/global lifecycle hooks and media-dependent hooks.
- Path syntax aligned with `identifier` (top-level and nested, e.g. `seo.internalNote`).
- Validation: `identifier` must not appear in `excludeFields` — **throw** in dev and prod.

**Out of scope:**

- Next.js consumer tags / wire keys.
- Union of plugin + collection exclude lists.

## 4. Precedence

| Priority | Source                                                                                               | Rule                                                                                                    |
| :------- | :--------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 1        | `CollectionConfig.custom.revalidation.excludeFields` or global equivalent                            | When `Object.hasOwn(revalidation, 'excludeFields')` — full list for that schema (`[]` = no exclusions). |
| 2        | `revalidation({ collections: { [slug]: { excludeFields } } })` or `globals: { [slug]: … }`           | Per slug in plugin when CMS schema omits `excludeFields`.                                               |
| 3        | `revalidation({ excludeFields })`                                                                    | Default when schema and per-slug plugin entries omit `excludeFields`.                                   |
| Media    | `Media.custom` → `collections.media` in plugin → `media: { excludeFields }` → plugin `excludeFields` | `isMediaDependent`; does not enable collection lifecycle on media.                                      |

## 5. Acceptance Criteria

1. Plugin `excludeFields: ['name']`, collection without own list — changing only `name` → no dispatch.
2. Plugin `['name']`, collection `excludeFields: ['description']` — changing only `name` → dispatch (schema list replaces plugin).
3. Redirects with `excludeFields: ['description']` — description-only edit → skip; `from`/`to`/`enabled`/`StatusCode` → dispatch.
4. Media with `excludeFields: ['name', 'alt']` — name-only edit → no parent revalidation.
5. Identifier change with other fields excluded → dual slug / dispatch still runs.
6. `excludeFields` containing configured `identifier` → throws at normalize/validate time.

## 6. Validation Commands

```bash
bunx turbo run test --filter=@klnap/revalidation
bunx turbo run test typecheck --filter=@klnap/revalidation
```

## 7. Testing Decisions

- Unit: `resolveExcludeFields`, `omitFieldPaths`, `normalizeExcludeFields`, `runRevalidationHook` integration with mock dispatcher.
- See plan table in package README cross-link.

## 8. Documentation Impact

- [x] Update `README.md` (`custom.revalidation`, plugin `excludeFields`).
