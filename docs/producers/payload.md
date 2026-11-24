# Payload CMS producer

The Payload producer is a plugin that emits revalidation events when collection and global documents change. It is one producer among possible others; the consumer does not depend on it.

Requires `payload >=3.94.1 <4`.

## Setup

```ts
import { http } from '@klnap/revalidation/dispatchers/http';
import { revalidation } from '@klnap/revalidation/producers/payload';

export default buildConfig({
  collections: [
    {
      slug: 'pages',
      custom: { revalidation: true },
      fields: [/* ... */],
    },
  ],
  plugins: [
    revalidation({
      target: { url: process.env.REVALIDATION_URL!, secret: process.env.REVALIDATION_SECRET! },
      dispatcher: http(),
    }),
  ],
});
```

Collections and globals do nothing until they opt in with `custom.revalidation`.

## Opting in

| Setting | Collections | Globals |
| --- | --- | --- |
| `custom.revalidation: true` | `afterChange` and `afterDelete` | `afterChange` |
| `custom.revalidation: { hooks: [...] }` | Chosen hooks (default: both) | `afterChange` only |
| `custom.revalidation: { identifier }` | Route identifier (see below) | Not applicable |
| `custom.revalidation: { excludeFields }` | Fields ignored by change detection | Same |
| `custom.revalidation: { enabled: false }` | Opted out | Opted out |

`identifier` accepts one field path or a list of paths. Without it, the document's `slug` is the route identifier.

## Event contents

Each changed document, in each affected locale, produces one item:

| Field | Value |
| --- | --- |
| `operation` | `create`, `update` or `delete` |
| `locale` | The locale of the change |
| `key` | The collection or global slug |
| `collection` / `global` | The slug of the source |
| `documentId` | The document id as a string (collections) |
| `slug` | The route identifier value (collections) |
| `identifiers` | Every configured identifier value, keyed by path (only when `identifier` is set) |

Items are grouped into events of at most 100 items.

Identifiers: the first configured path is the route key. Each path is read independently; they are not combined. If an identifier value changed, the producer also emits the previous values, so cache entries under the old identifier are invalidated too.

## Change detection

A save produces an item only when the document content changed in that locale. The comparison ignores the root fields `id`, `createdAt`, `updatedAt` and `_status`, nested `id` values, and any excluded field.

- The edited locale is compared with its previous version from `previousDoc`.
- Other locales are compared with their latest published version. This needs drafts enabled. Without drafts, other locales are always emitted, because no previous version is kept.

`excludeFields` precedence, highest first: the collection's own `custom.revalidation.excludeFields` (an empty list counts), the plugin's per-collection or per-global entry, then the plugin-wide `excludeFields`. Identifier fields cannot be excluded; the plugin throws at startup if you try.

## Localization

Locales come from `config.localization`. Without localization, the producer uses `en`. A write that does not identify a locale (publish-all, global writes) covers every configured locale.

## Drafts and publishing

- Autosave saves do not emit events.
- A document that is not published does not emit events for its locale, except when that locale was published before: then the previous published content is emitted, so its cache entries are cleared.
- Delete events ignore draft status.
- Collections with `drafts` are checked against the published version of each locale.

## Timing and failures

- Each save hook schedules dispatch after the hook returns (one second later). Dispatch is not tied to the database commit, and a rolled-back save is not cancelled. If a save is rolled back after its hook ran, the event is still sent. Treat events as "a change was attempted", and make consumers tolerant of that.
- Orderable reorders are deferred until commit through `deferRevalidationUntilCommit`, and discarded on rollback. This applies to the orderable hooks only.
- Dispatch errors (transport errors, non-accepted outcomes) are logged and do not reject the save.
- A read error while building an event (for example a failing `findByID`) is logged and does not reject the save. The affected revalidation is lost.

## Media

A change to a shared media file also revalidates the documents that use it. See [media dependencies](payload-media-dependencies.md).

## Limitations

- Each `revalidation()` call stores its dispatcher target in process-wide state. A second Payload configuration in the same process replaces the first target.
- Only collections and globals with `custom.revalidation` are searched for dependents, and only the hooks listed above are emitted.
