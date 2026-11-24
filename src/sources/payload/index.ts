import * as v from 'valibot'
import { invalidKey } from '../../core/errors.js'
import type { SourceDefinition } from '../../core/pipeline.js'

export const payloadRevalidationItemSchema = v.object({
  operation: v.picklist(['create', 'update', 'delete']),
  locale: v.string(),
  key: v.string(),
  collection: v.optional(v.string()),
  global: v.optional(v.string()),
  slug: v.optional(v.string()),
  documentId: v.optional(v.string()),
  identifiers: v.optional(v.record(v.string(), v.string())),
})

export type PayloadRevalidationItem = v.InferOutput<typeof payloadRevalidationItemSchema>

/** Opt-in helper when using full DSL `sources.payload` (not used by low-effort defaults). */
const resolvePayloadCacheKey = (data: unknown): string => {
  const parsed = v.parse(payloadRevalidationItemSchema, data)
  return parsed.key || invalidKey()
}

/** Canonical `sources.payload` entry for Next (or custom) consumers. */
export const payloadRevalidationSource = (): SourceDefinition => ({
  schema: payloadRevalidationItemSchema,
  resolve: resolvePayloadCacheKey,
})
