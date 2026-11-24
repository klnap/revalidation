import { describe, expect, it, mock } from 'bun:test'

import {
  describeLocaleSkip,
  formatLogDetail,
  logRevalidateDispatch,
  revalidationLog,
  revalidationLogError,
} from './log.ts'

describe('revalidation log messages', () => {
  it('describeLocaleSkip uses compact tokens', () => {
    expect(describeLocaleSkip('de:draft')).toBe('de draft')
    expect(describeLocaleSkip('en:empty')).toBe('en empty')
    expect(describeLocaleSkip('pl:missing')).toBe('pl missing')
  })

  it('revalidationLog uses action · subject · detail', () => {
    const info = mock(() => {})
    revalidationLog.skip({ info }, 'collection:projects', 'id:42 · autosave')
    expect(info).toHaveBeenCalledWith('[revalidate] skip · collection:projects · id:42 · autosave')
  })

  it('logRevalidateDispatch lists locales, id, and omitted', () => {
    const info = mock(() => {})
    logRevalidateDispatch({ info }, 'collection:projects', ['de'], ['en:empty'], 42)
    expect(info).toHaveBeenCalledWith(
      '[revalidate] dispatch · collection:projects · de · id:42 · omit en empty',
    )
  })

  it('formatLogDetail orders locales before id', () => {
    expect(formatLogDetail({ locales: ['pl'], docId: 7, reason: 'autosave' })).toBe(
      'pl · id:7 · autosave',
    )
  })

  it('revalidationLogError defaults subject to dispatch', () => {
    const error = mock(() => {})
    revalidationLogError({ error }, 'connection refused')
    expect(error).toHaveBeenCalledWith('[revalidate] error · dispatch · connection refused')
  })
})
