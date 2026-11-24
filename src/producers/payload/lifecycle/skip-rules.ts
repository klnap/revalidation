import type { CollectionConfig, GlobalConfig } from 'payload'

import { docsContentEqual } from './doc-content.js'
import { isUnpublishedStatus } from './draft-status.js'
import { getRequestLocale, isDraftSave } from './locale.js'
import { hasLocalizedDraftStatus, isLocaleUnpublished } from './locale-published.js'
import { getOperation } from './operation.js'
import type { RevalidateArgs, RevalidationChange } from './types.js'

export const draftVersionsEnabled = (schema: {
  versions?: CollectionConfig['versions'] | GlobalConfig['versions']
}): boolean => {
  const versions = schema.versions
  if (!versions || typeof versions !== 'object' || !('drafts' in versions)) return false
  return Boolean(versions.drafts)
}

export const shouldSkipDraftRevalidation = (args: RevalidateArgs): boolean => {
  if (getOperation(args) === 'delete') return false
  if (isDraftSave(args.req)) return true
  if (!('doc' in args) || !args.doc) return false

  const schema = 'collection' in args ? args.collection : args.global
  if (!draftVersionsEnabled(schema)) return false

  if (hasLocalizedDraftStatus(schema) && getRequestLocale(args.req)) {
    // Locale-tab publish/unpublish passes a locale-scoped `_status` string — per-locale loop decides dispatch.
    return false
  }

  return isUnpublishedStatus((args.doc as Record<string, unknown>)._status)
}

/** Collection or global with drafts — per-locale or string `_status`. */
export const shouldSkipUnpublishedLocaleDoc = ({
  args,
  locale,
  localeDoc,
  operation,
}: {
  args: RevalidateArgs
  locale: string
  localeDoc: Record<string, unknown>
  operation: RevalidationChange['operation']
}): boolean => {
  if (operation === 'delete') return false
  const schema = 'collection' in args ? args.collection : args.global
  if (!draftVersionsEnabled(schema)) return false
  const localizeStatus = hasLocalizedDraftStatus(schema)
  return isLocaleUnpublished(localeDoc._status, locale, localizeStatus)
}

export const shouldSkipUnchangedLocale = ({
  current,
  previous,
  operation,
  excludeFields,
}: {
  current: Record<string, unknown>
  previous?: Record<string, unknown>
  operation: RevalidationChange['operation']
  excludeFields?: readonly string[]
}): boolean => {
  if (operation === 'delete') return false
  if (!previous) return false

  const becamePublished = current._status === 'published' && previous._status !== 'published'
  if (becamePublished) return false

  const statusSignature = (status: unknown): string => {
    if (status === undefined) return ''
    if (typeof status !== 'object' || status === null) return String(status)
    return JSON.stringify(
      Object.entries(status as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  if (statusSignature(current._status) !== statusSignature(previous._status)) {
    return false
  }

  return docsContentEqual(current, previous, { excludeFields })
}
