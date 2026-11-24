import type { CollectionConfig, GlobalConfig } from 'payload'

type DraftVersionsSchema = Pick<CollectionConfig, 'versions'> | Pick<GlobalConfig, 'versions'>

export const hasLocalizedDraftStatus = (schema: DraftVersionsSchema): boolean => {
  const versions = schema.versions
  if (!versions || typeof versions !== 'object' || !('drafts' in versions)) return false
  const drafts = versions.drafts
  return typeof drafts === 'object' && drafts !== null && drafts.localizeStatus === true
}

/** Per-locale publish check for locale-scoped reads (`findByID` / `findGlobal` with `locale`). */
export const isLocalePublished = (
  status: unknown,
  locale: string,
  _localizeStatus: boolean,
): boolean => {
  if (typeof status === 'object' && status !== null) {
    return (status as Record<string, unknown>)[locale] === 'published'
  }
  if (status === 'published') {
    // Locale-scoped API returns a resolved string even when `localizeStatus` is enabled.
    return true
  }
  return false
}

export const isLocaleUnpublished = (
  status: unknown,
  locale: string,
  localizeStatus: boolean,
): boolean => !isLocalePublished(status, locale, localizeStatus)
