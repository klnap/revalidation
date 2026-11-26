import * as v from 'valibot'

export const legacyPayloadItemSchema = v.object({
  operation: v.picklist(['create', 'update', 'delete']),
  locale: v.string(),
  key: v.string(),
  collection: v.optional(v.string()),
  global: v.optional(v.string()),
  slug: v.optional(v.string()),
  documentId: v.optional(v.string()),
  identifiers: v.optional(v.record(v.string(), v.string())),
})

export type LegacyPayloadItem = v.InferOutput<typeof legacyPayloadItemSchema>
