import type { CacheEntry, CacheMode, CacheResolverOutput } from './types.js'

export const normalizeItems = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  return [data]
}

export const normalizeResolverOutput = (
  output: CacheResolverOutput,
  defaultMode: CacheMode,
): CacheEntry[] => {
  if (output === null || output === undefined) return []

  const normalizeOne = (entry: string | CacheEntry): CacheEntry => {
    if (typeof entry === 'string') return { value: entry, mode: defaultMode }
    return entry
  }

  if (typeof output === 'string' || (typeof output === 'object' && 'value' in output)) {
    return [normalizeOne(output as string | CacheEntry)]
  }

  const entries: CacheEntry[] = []
  for (const item of output) {
    if (item === null || item === undefined) continue
    entries.push(normalizeOne(item))
  }
  return entries
}

export const dedupeEntries = (entries: CacheEntry[]): CacheEntry[] => {
  const seen = new Set<string>()
  const out: CacheEntry[] = []
  for (const entry of entries) {
    const key = `${entry.mode}\0${entry.value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}
