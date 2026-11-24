# Media-dependent revalidation — Payload producer

## 1. Problem

When a CMS **media** upload changes (metadata, replacement file, or delete), pages that reference that asset can stay stale unless their parent documents are revalidated too.

## 2. Behavior overview

With `revalidation({ media: … })` (or `{ media: true }`), the plugin wires hooks on the resolved **media upload collection**:

- **`afterChange`** (update only) — resolve affected locales from media field diffs, find published parents that reference the media ID, dispatch parent-shaped wire items.
- **`beforeDelete`** — resolve dependents for all site locales and dispatch before the media row is removed.

Dependent dispatches use the same envelope as parent lifecycle hooks: `{ source: 'payload', data: PayloadRevalidationItem[] }`. Wire **`operation`** for those parent items is **`update`** (including on media delete), not `delete`.

Media hooks are separate from opt-in **`custom.revalidation`** on parent collections; parents do not need their own hook to receive dependent invalidation when registered paths reference them.

## 3. Static registry (not schema discovery)

Reverse lookup uses an **explicit in-package list** — `MEDIA_REFERENCES` in `src/producers/payload/media/media-references.ts`. The producer does **not** read Payload collection configs to discover upload fields.

| Implication               | Detail                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New upload field          | Add or change a registry row in **this package’s source** (or your fork). Payload `custom.revalidation` on the parent collection does **not** register media paths. |
| No public registry API    | `MEDIA_REFERENCES` is **not** exported from `@klnap/revalidation/producers/payload`. Runtime registration from host config is not supported.                        |
| Missing registry row      | Parent documents referenced only through that field are **not** found — dependent revalidation is **skipped** (no error).                                           |
| Wrong / stale `wherePath` | `payload.find` with a path that does not exist on the collection can **fail at query time** (Payload error), not a silent skip.                                     |
| Globals                   | Matched by loading each registered global and comparing the nested `path` to the media ID (no `where` query).                                                       |

Contract tests in `tests/contract/media-references.test.ts` assert the shipped registry matches the **Shipped registry** table below.

## 4. Registry entry shapes

**Collection** (`CollectionMediaRef`):

| Field       | Meaning                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `slug`      | Parent collection slug                                                                                            |
| `wherePath` | Payload `where` key (supports dot paths, e.g. `socialMedia.image.asset`)                                          |
| `hasDrafts` | When true, only **`published`** parent docs emit dependents (except media delete path)                            |
| `hasMany`   | Optional. **`true`** → query `{ [wherePath]: { in: [mediaId] } }`. Omitted or **`false`** → `{ equals: mediaId }` |

**Global** (`GlobalMediaRef`):

| Field  | Meaning                                                                             |
| ------ | ----------------------------------------------------------------------------------- |
| `slug` | Global slug                                                                         |
| `path` | Keys from global root to the upload field, e.g. `['socialMedia', 'image', 'asset']` |

## 5. Shipped registry (v0.2.0)

Update this table when you change `MEDIA_REFERENCES`.

### Collections (`projects`, drafts enabled)

| `wherePath`               | `hasMany` |
| ------------------------- | --------- |
| `image`                   | no        |
| `gallery`                 | **yes**   |
| `socialMedia.image.asset` | no        |

### Globals

| Global slug           | Path to upload            |
| --------------------- | ------------------------- |
| `home-page`           | `socialMedia.image.asset` |
| `about-page`          | `image`                   |
| `about-page`          | `socialMedia.image.asset` |
| `privacy-policy-page` | `socialMedia.image.asset` |
| `work-page`           | `socialMedia.image.asset` |

## 6. Deduplication

`resolveMediaDependentChanges` merges results from every registry entry. If the same parent is reached via multiple paths (e.g. `image` and `gallery` on one document), only **one** `RevalidationChange` is kept per **`type` + parent `slug` + `locale` + parent document `id`**.

## 7. Plugin `media` option

| Config                          | Role                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `media: true`                   | Enable hooks; auto-detect upload collection (sole upload, or slug `media` among uploads)                          |
| `media: { collection: '…' }`    | Force media collection slug                                                                                       |
| `media: { excludeFields: […] }` | Fields ignored when deciding if a media **update** affects locales (see [exclude-fields.md](./exclude-fields.md)) |

## 8. Maintenance checklist

1. Add the upload field in Payload as usual.
2. Add or update the matching row in `MEDIA_REFERENCES` (`hasMany: true` for multi-upload relationships).
3. Extend `tests/contract/media-references.test.ts` documented paths if you ship the change upstream.
4. Run the media contract and unit coverage (`tests/contract/media-references.test.ts`, `src/producers/payload/media/`) when changing query behavior.
