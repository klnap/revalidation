import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'

export const resourceChangedEventType = 'com.klnap.revalidation.resource.changed.v1'

const resourceSchema = v.object({
  type: v.string(),
  name: v.optional(v.string()),
  id: v.optional(v.string()),
  locale: v.optional(v.string()),
  slug: v.optional(v.string()),
  identifiers: v.optional(v.record(v.string(), v.string())),
})

export const resourceChangedSchema = v.object({
  operation: v.picklist(['create', 'update', 'delete']),
  resource: resourceSchema,
  affected: v.array(
    v.object({
      operation: v.picklist(['create', 'update', 'delete']),
      resource: resourceSchema,
    }),
  ),
}) satisfies StandardSchemaV1

export type ResourceChangedData = v.InferOutput<typeof resourceChangedSchema>
