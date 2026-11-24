import type { RevalidateArgs } from './types.js'

type RevalidationInfoLogger = {
  info?: (message: string) => void
}

type RevalidationWarnLogger = {
  warn?: (message: string) => void
}

type RevalidationErrorLogger = RevalidationInfoLogger & {
  error: (message: string) => void
}

const PREFIX = '[revalidate]'
const SEP = ' · '

export type LocaleSkipReason = 'draft' | 'empty' | 'missing'

const localeSkipPhrase = (locale: string, reason: LocaleSkipReason): string => {
  switch (reason) {
    case 'draft':
      return `${locale} draft`
    case 'empty':
      return `${locale} empty`
    case 'missing':
      return `${locale} missing`
  }
}

/** Turns internal tokens like `de:draft` into compact log text. */
export const describeLocaleSkip = (token: string): string => {
  const sep = token.indexOf(':')
  if (sep === -1) return token
  const locale = token.slice(0, sep)
  const reason = token.slice(sep + 1)
  if (reason === 'draft' || reason === 'empty' || reason === 'missing') {
    return localeSkipPhrase(locale, reason)
  }
  return token
}

const line = (action: string, subject: string, detail?: string): string => {
  return detail
    ? `${PREFIX} ${action}${SEP}${subject}${SEP}${detail}`
    : `${PREFIX} ${action}${SEP}${subject}`
}

/** Structured CMS logs: `dispatch|skip · subject · detail` */
export const revalidationLog = {
  skip(logger: RevalidationInfoLogger, subject: string, detail: string): void {
    logger.info?.(line('skip', subject, detail))
  },
  dispatch(logger: RevalidationInfoLogger, subject: string, detail: string): void {
    logger.info?.(line('dispatch', subject, detail))
  },
  warn(logger: RevalidationWarnLogger, subject: string, detail: string): void {
    logger.warn?.(line('warn', subject, detail))
  },
}

export const revalidationLogError = (
  logger: RevalidationErrorLogger,
  detail: string,
  subject = 'dispatch',
): void => {
  logger.error(line('error', subject, detail))
}

export const mediaSubject = (mediaId: string | number): string => `media:${mediaId}`

export const revalidationSubject = (args: RevalidateArgs): string => {
  const type = 'collection' in args ? 'collection' : 'global'
  const slug = 'collection' in args ? args.collection.slug : args.global.slug
  return `${type}:${slug}`
}

export const collectionDocId = (args: RevalidateArgs): string | number | undefined => {
  if (!('collection' in args)) return undefined
  const id = args.doc?.id
  if (id === undefined || id === null) return undefined
  return id as string | number
}

export type FormatLogDetailInput = {
  locales?: string[]
  docId?: string | number
  skippedTokens?: string[]
  reason?: string
}

export const formatLogDetail = ({
  locales,
  docId,
  skippedTokens,
  reason,
}: FormatLogDetailInput): string => {
  const parts: string[] = []
  if (locales?.length) parts.push(locales.join(', '))
  if (docId !== undefined && docId !== null) parts.push(`id:${docId}`)
  if (skippedTokens?.length) {
    parts.push(`omit ${skippedTokens.map(describeLocaleSkip).join(', ')}`)
  }
  if (reason) parts.push(reason)
  return parts.join(SEP)
}

export const uniqueLocalesFromChanges = (locales: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const locale of locales) {
    if (seen.has(locale)) continue
    seen.add(locale)
    out.push(locale)
  }
  return out
}

export const logRevalidateDispatch = (
  logger: RevalidationInfoLogger,
  target: string,
  locales: string[],
  skippedTokens: string[] = [],
  docId?: string | number,
): void => {
  const detail = formatLogDetail({ locales, docId, skippedTokens })
  revalidationLog.dispatch(logger, target, detail)
}
