# Media dependencies

A media file is often shared by many documents: a hero image on several pages, or a logo in a global. Without tracking, replacing the file leaves those pages cached with the old image until someone republishes each one.

With media tracking, a change to a media document revalidates every supported document that the producer resolves. Nothing needs to be republished.

```ts
revalidation({
  target: { url: process.env.REVALIDATION_URL!, secret: process.env.REVALIDATION_SECRET! },
  dispatcher: http(),
});
```

No option is needed when the upload collection is the only upload collection or is named `media`. Otherwise, pass it explicitly:

```ts
revalidation({
  target,
  dispatcher: http(),
  media: mediaCollection, // the CollectionConfig of the upload collection
  // or: media: { collection: mediaCollection, excludeFields: ['updatedAt'] }
});
```

## What triggers it

- **Update of a media document**, after the save. Creates do not trigger it.
- **Delete of a media document**, before the row is removed, for every configured locale.

Only collections and globals that opted in with `custom.revalidation` are searched.

## Which locales are revalidated

- An edit to one locale revalidates that locale's dependents.
- A change to a shared property revalidates every locale. Shared properties are all fields except `alt`, which is treated as the only localized media field, and except the fields in `excludeFields`.
- A change to `alt` revalidates only the locale whose `alt` changed.
- Without a previous version, every candidate locale is revalidated.

Exclude only fields that do not affect rendered output. Excluding `alt` text, for example, leaves pages showing old alt text.

## Which documents are found

For each registered reference, the producer queries documents whose upload field equals the media id, one locale at a time, paging through all results. It passes the hook request to Payload so reads retain the current transaction and request context; internal discovery uses `overrideAccess: true` and remains scoped to configured references and the changed media id. For collections with drafts, only published documents are included. Deletes use the same query, so unpublished documents are not revalidated on delete either.

A document that references the media through several fields produces one item per locale.

Dependents are emitted as `update` events, including on media delete. The parent document still exists, so its content is what changed.

## Resolution failures

If a reference, locale, or later pagination query fails, the producer keeps and dispatches dependents it already resolved, then logs each failed scope as an incomplete media dependency resolution. If every query fails, it does not log `no references`. The Payload save still succeeds; these hooks expose no structured resolution result and do not retry failed queries. Check Payload logs and revalidate missed pages through the host application's normal recovery path.

Collection references are scanned with ordered keyset queries, not a database snapshot. Concurrent changes can affect which dependents a scan observes; this plugin does not promise transaction isolation or a complete point-in-time view.
There is no total dependent-count or traversal-duration cap: every configured match is resolved to avoid silently leaving stale cache entries. Configure host-level authorization and database/process resource limits appropriate to the dataset size.

## Compatibility

Discovery reads the Payload config. It follows these schema structures:

| Structure | Collections | Globals |
| --- | --- | --- |
| `upload` field to the media collection | Yes | Yes |
| `relationship` to the media collection (single) | Yes | Yes |
| `hasMany` upload or relationship | Yes | No |
| Inside `group`, `row`, `collapsible`, named or unnamed `tabs` | Yes | Yes |
| Inside `array` | Yes | No |
| Inside `blocks` | No | No |
| `relationship` or `upload` that accepts several collections | No | No |
| Inside `richText` (embedded uploads) | No | No |
| Inside `json` or `join` fields | No | No |
| Documents one relationship away (a parent that links to a page using the media) | No | No |

Unsupported structures are not an error. Pages that reference the media only through them are not revalidated, and no log is written. If a page depends on one of these structures, add a direct upload field to the document type, or revalidate it explicitly.

## Automatic detection of the upload collection

Without the `media` option, the producer uses the only upload collection, or the one with slug `media`. If the project has several upload collections and none is named `media`, media tracking is not installed, and nothing is logged. Pass `media` explicitly in that case.
