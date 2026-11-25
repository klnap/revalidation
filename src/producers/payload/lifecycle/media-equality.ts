import type { DocsContentEqualOptions } from './doc-content.js'
import { omitFieldPaths } from './doc-content.js'

const TECHNICAL_KEYS = new Set(['id', 'createdAt', 'updatedAt', '_status', 'globalType'])
const VOLATILE_NESTED_KEYS = new Set(['id'])

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (VOLATILE_NESTED_KEYS.has(key)) return acc
        acc[key] = sortKeys(record[key])
        return acc
      }, {})
  }
  return value
}

const stripForMediaShared = (
  doc: Record<string, unknown>,
  excludeFields: readonly string[],
): unknown => {
  const withoutExcluded = excludeFields.length ? omitFieldPaths(doc, excludeFields) : doc
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(withoutExcluded)) {
    if (TECHNICAL_KEYS.has(key)) continue
    out[key] = value
  }
  return sortKeys(out)
}

export const MEDIA_LOCALIZED_KEYS = new Set(['alt'])

/** True when non-excluded media fields match (file/url/focal/…). */
export const mediaSharedFieldsEqual = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  options?: DocsContentEqualOptions,
): boolean => {
  const excludeFields = options?.excludeFields ?? []
  return (
    JSON.stringify(stripForMediaShared(a, excludeFields)) ===
    JSON.stringify(stripForMediaShared(b, excludeFields))
  )
}
