/** Payload field path — top-level (`slug`) or nested (`seo.slug`). */
export type RevalidationIdentifierField = string

/**
 * One field path, or several. Each entry is an independent identifier, not a fallback and not a
 * composite key: every configured field's value (and its previous value) is reported on the change.
 */
export type RevalidationIdentifier =
  | RevalidationIdentifierField
  | readonly RevalidationIdentifierField[]

export class RevalidationIdentifierError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevalidationIdentifierError'
  }
}

/**
 * Normalises `identifier` to a deduplicated list of trimmed field paths.
 * Missing or blank string → no identifier (the document's `slug` is used). An array must be non-empty
 * and contain only non-empty strings; anything else throws at plugin initialisation.
 */
export function normalizeIdentifiers(value: unknown): RevalidationIdentifierField[] {
  if (value === undefined || value === null) return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  if (!Array.isArray(value)) {
    throw new RevalidationIdentifierError(
      'revalidation identifier must be a string or an array of field paths',
    )
  }
  if (value.length === 0) {
    throw new RevalidationIdentifierError('revalidation identifier array must not be empty')
  }
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new RevalidationIdentifierError(
        'revalidation identifier array entries must be non-empty strings',
      )
    }
    const trimmed = entry.trim()
    if (!out.includes(trimmed)) out.push(trimmed)
  }
  return out
}

/** Shape for `CollectionConfig.custom.revalidation` / `GlobalConfig.custom.revalidation`. */
export type PayloadRevalidationCustom =
  | true
  | {
      enabled?: boolean
      identifier?: RevalidationIdentifier
      /** Field used to sort adjacent documents. Defaults to Payload's `_order` for orderable collections. */
      orderField?: string
      hooks?: Array<'afterChange' | 'afterDelete'>
      /** Fields ignored when comparing current vs previous for dispatch skip. */
      excludeFields?: string[]
    }

const REVALIDATION_CUSTOM_KEY = 'revalidation' as const

export function readRevalidationCustom(custom: unknown): PayloadRevalidationCustom | null {
  if (!custom || typeof custom !== 'object') return null
  const entry = (custom as Record<string, unknown>)[REVALIDATION_CUSTOM_KEY]
  if (entry === true) return true
  if (!entry || typeof entry !== 'object') return null
  const record = entry as Record<string, unknown>
  if (record.enabled === false) return null
  return entry as Exclude<PayloadRevalidationCustom, true>
}

export type NormalizedCollectionRevalidation = {
  enabled: boolean
  hooks: Array<'afterChange' | 'afterDelete'>
  /** Configured identifier field paths, in configuration order. Empty when none is configured. */
  identifiers: RevalidationIdentifierField[]
  /** First configured identifier, for callers that need one route key. */
  identifier?: RevalidationIdentifierField
}

export function normalizeCollectionRevalidation(
  value: PayloadRevalidationCustom,
): NormalizedCollectionRevalidation {
  if (value === true) {
    return { enabled: true, hooks: ['afterChange', 'afterDelete'], identifiers: [] }
  }
  const identifiers = normalizeIdentifiers(value.identifier)
  return {
    enabled: value.enabled ?? true,
    hooks: value.hooks ?? ['afterChange', 'afterDelete'],
    identifiers,
    ...(identifiers[0] ? { identifier: identifiers[0] } : undefined),
  }
}

export type NormalizedGlobalRevalidation = {
  enabled: boolean
  hooks: Array<'afterChange'>
}

export function normalizeGlobalRevalidation(
  value: PayloadRevalidationCustom,
): NormalizedGlobalRevalidation {
  if (value === true) return { enabled: true, hooks: ['afterChange'] }
  const hooks = (value.hooks ?? ['afterChange']).filter(
    (h): h is 'afterChange' => h === 'afterChange',
  )
  return {
    enabled: value.enabled ?? true,
    hooks: hooks.length > 0 ? hooks : ['afterChange'],
  }
}
