/** Root-only metadata — not content. */
const TECHNICAL_KEYS = new Set(['id', 'createdAt', 'updatedAt', '_status', 'globalType'])

/**
 * Nested noise that changes on republish without real edits.
 * Lexical node `id`s regenerate every publish-all locale write (esp. last locale).
 */
const VOLATILE_NESTED_KEYS = new Set(['id'])

export type DocsContentEqualOptions = {
  excludeFields?: readonly string[]
}

const deleteAtPath = (root: Record<string, unknown>, path: string): void => {
  const segments = path.split('.').filter(Boolean)
  if (segments.length === 0) return

  let current: Record<string, unknown> = root
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    if (!segment) return
    const next = current[segment]
    if (!next || typeof next !== 'object' || Array.isArray(next)) return
    current = next as Record<string, unknown>
  }

  const leaf = segments[segments.length - 1]
  if (leaf) delete current[leaf]
}

/** Removes top-level or nested field paths before content comparison. */
export const omitFieldPaths = (
  doc: Record<string, unknown>,
  paths: readonly string[],
): Record<string, unknown> => {
  const clone = structuredClone(doc) as Record<string, unknown>
  for (const path of paths) {
    if (path.includes('.')) {
      deleteAtPath(clone, path)
    } else {
      delete clone[path]
    }
  }
  return clone
}

export const hasLocaleData = (doc: Record<string, unknown> | undefined): boolean => {
  if (!doc) return false

  return Object.entries(doc).some(([key, value]) => {
    if (TECHNICAL_KEYS.has(key)) return false
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value).length > 0
    return true
  })
}

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

const stripTechnical = (doc: Record<string, unknown>): unknown => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(doc)) {
    if (TECHNICAL_KEYS.has(key)) continue
    out[key] = value
  }
  return sortKeys(out)
}

const prepareForCompare = (
  doc: Record<string, unknown>,
  options?: DocsContentEqualOptions,
): unknown => {
  const withoutExcluded = options?.excludeFields?.length
    ? omitFieldPaths(doc, options.excludeFields)
    : doc
  return stripTechnical(withoutExcluded)
}

/** Content-only equality — ignores timestamps / _status / Lexical node ids / excludeFields. */
export const docsContentEqual = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  options?: DocsContentEqualOptions,
): boolean =>
  JSON.stringify(prepareForCompare(a, options)) === JSON.stringify(prepareForCompare(b, options))
