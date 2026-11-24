export type LocalizationConfig = {
  locales: { code: string; label?: string | Record<string, string> }[] | string[]
}

export const localeCodes = (localization: LocalizationConfig): string[] =>
  localization.locales.map((locale) => (typeof locale === 'string' ? locale : locale.code))
