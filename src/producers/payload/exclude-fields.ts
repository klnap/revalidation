import type { RevalidationIdentifierField } from './revalidation-custom.js'

const REVALIDATION_CUSTOM_KEY = 'revalidation' as const

const revalidationEntry = (custom: unknown): Record<string, unknown> | null => {
  if (!custom || typeof custom !== 'object') return null
  const entry = (custom as Record<string, unknown>)[REVALIDATION_CUSTOM_KEY]
  if (entry === true) return {}
  if (!entry || typeof entry !== 'object') return null
  return entry as Record<string, unknown>
}

/**
 * Reads `excludeFields` when explicitly set on `custom.revalidation` (including `[]`).
 * Ignores `enabled: false` — used for media dependents without lifecycle hooks.
 */
export function readRevalidationExcludeFields(custom: unknown): string[] | undefined {
  const entry = revalidationEntry(custom)
  if (!entry || !Object.hasOwn(entry, 'excludeFields')) return undefined
  const raw = entry.excludeFields
  if (!Array.isArray(raw)) return undefined
  return raw.filter((item): item is string => typeof item === 'string')
}

export class RevalidationExcludeFieldsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevalidationExcludeFieldsError'
  }
}

export const normalizeExcludeFields = (
  paths: readonly string[],
  options?: { identifiers?: readonly RevalidationIdentifierField[] },
): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const path of paths) {
    if (typeof path !== 'string') continue
    const trimmed = path.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  for (const identifier of options?.identifiers ?? []) {
    if (normalized.includes(identifier)) {
      throw new RevalidationExcludeFieldsError(
        `revalidation excludeFields must not include identifier field "${identifier}"`,
      )
    }
  }

  return normalized
}

export type PluginExcludeFieldsBySlug = Readonly<Record<string, readonly string[]>>

export type ResolveExcludeFieldsInput = {
  schemaCustom?: unknown
  pluginExcludeFields?: readonly string[]
  pluginCollectionExcludeFields?: PluginExcludeFieldsBySlug
  pluginGlobalExcludeFields?: PluginExcludeFieldsBySlug
  collectionSlug?: string
  globalSlug?: string
  mediaSchemaCustom?: unknown
  mediaPluginExcludeFields?: readonly string[]
  isMediaDependent?: boolean
  identifiers?: readonly RevalidationIdentifierField[]
}

const pluginSlugExcludeList = (
  map: PluginExcludeFieldsBySlug | undefined,
  slug: string | undefined,
): readonly string[] | undefined => {
  if (!slug || !map || !Object.hasOwn(map, slug)) return undefined
  return map[slug]
}

export const resolveExcludeFields = ({
  schemaCustom,
  pluginExcludeFields,
  pluginCollectionExcludeFields,
  pluginGlobalExcludeFields,
  collectionSlug,
  globalSlug,
  mediaSchemaCustom,
  mediaPluginExcludeFields,
  isMediaDependent,
  identifiers,
}: ResolveExcludeFieldsInput): string[] => {
  if (isMediaDependent) {
    const mediaExplicit = readRevalidationExcludeFields(mediaSchemaCustom)
    if (mediaExplicit !== undefined) {
      return normalizeExcludeFields(mediaExplicit, { identifiers })
    }
    const mediaCollectionSlug = collectionSlug
    const mediaPluginPerSlug = pluginSlugExcludeList(
      pluginCollectionExcludeFields,
      mediaCollectionSlug,
    )
    if (mediaPluginPerSlug !== undefined) {
      return normalizeExcludeFields(mediaPluginPerSlug, { identifiers })
    }
    if (mediaPluginExcludeFields?.length) {
      return normalizeExcludeFields(mediaPluginExcludeFields, { identifiers })
    }
    if (pluginExcludeFields?.length) {
      return normalizeExcludeFields(pluginExcludeFields, { identifiers })
    }
    return []
  }

  const schemaExplicit = readRevalidationExcludeFields(schemaCustom)
  if (schemaExplicit !== undefined) {
    return normalizeExcludeFields(schemaExplicit, { identifiers })
  }

  const pluginPerSlug = pluginSlugExcludeList(
    collectionSlug ? pluginCollectionExcludeFields : pluginGlobalExcludeFields,
    collectionSlug ?? globalSlug,
  )
  if (pluginPerSlug !== undefined) {
    return normalizeExcludeFields(pluginPerSlug, { identifiers })
  }

  if (pluginExcludeFields?.length) {
    return normalizeExcludeFields(pluginExcludeFields, { identifiers })
  }

  return []
}

export type PluginSchemaExcludeFieldsEntry = {
  excludeFields?: string[]
}

/** Builds slug → list map for entries that explicitly set `excludeFields` (including `[]`). */
export const buildPluginExcludeFieldsBySlug = (
  entries: Record<string, PluginSchemaExcludeFieldsEntry> | undefined,
): PluginExcludeFieldsBySlug | undefined => {
  if (!entries) return undefined
  const out: Record<string, readonly string[]> = {}
  for (const [slug, entry] of Object.entries(entries)) {
    if (!entry || !Object.hasOwn(entry, 'excludeFields')) continue
    out[slug] = normalizeExcludeFields(entry.excludeFields ?? [])
  }
  return Object.keys(out).length > 0 ? out : undefined
}
