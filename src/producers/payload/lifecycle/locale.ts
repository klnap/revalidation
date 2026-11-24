import type { PayloadRequest, TypedLocale } from 'payload'
import { isPublishAllLocales } from '../publish-all/request-flags.js'
import { isRevalidationAllLocales } from './deferred.js'
import { getOperation } from './operation.js'
import type { RevalidateArgs } from './types.js'

/** Wire + tag locale when `config.localization` is off (single-locale hosts). */
export const resolveDefaultLocaleCode = (req: PayloadRequest): string => {
  const localization = req.payload.config.localization
  if (localization && typeof localization === 'object' && 'defaultLocale' in localization) {
    const code = localization.defaultLocale
    if (typeof code === 'string' && code.length > 0) return code
  }
  return 'en'
}

export const listLocales = (req: PayloadRequest): string[] => {
  const localization = req.payload.config.localization
  if (!localization) return [resolveDefaultLocaleCode(req)]

  return localization.locales.map((locale) => (typeof locale === 'string' ? locale : locale.code))
}

/** Bridge config locale codes → Payload `TypedLocale` (generated from localization config). */
export const toTypedLocale = (locale: string): TypedLocale => locale as TypedLocale

export { isPublishAllLocales } from '../publish-all/request-flags.js'

export const isDraftSave = (req: { query?: Record<string, unknown> }): boolean =>
  req.query?.draft === 'true' || req.query?.draft === true

const asLocaleCode = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value !== 'all' ? value : undefined

/**
 * Locale actually being edited/published (admin tab).
 * Prefer query over req.locale — on publishAllLocales Payload leaves req.locale
 * as the last locale it iterated (en↔de swap), while query.locale stays the tab.
 */
export const getRequestLocale = (req: {
  locale?: string | null
  query?: Record<string, unknown>
}): string | undefined =>
  asLocaleCode(req.query?.publishSpecificLocale) ??
  asLocaleCode(req.query?.locale) ??
  asLocaleCode(req.locale)

export const resolveChangedLocales = ({
  args,
  locales,
}: {
  args: RevalidateArgs
  locales: string[]
}): string[] => {
  if (getOperation(args) === 'delete') return locales
  if (isPublishAllLocales(args.req)) return locales
  if (isRevalidationAllLocales(args.req)) return locales
  const locale = getRequestLocale(args.req)
  if (locale) return [locale]
  return locales
}
