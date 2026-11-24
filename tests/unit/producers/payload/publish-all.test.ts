import { describe, expect, it } from 'bun:test'

import { mirrorPublishAllLocalesFlagsToReq } from '../../../../src/producers/payload/publish-all/mirror-publish-all-locales-to-req'
import { preserveLocalesOnPublishAll } from '../../../../src/producers/payload/publish-all/preserve-locales-on-publish-all'
import { isPublishAllLocales } from '../../../../src/producers/payload/publish-all/request-flags'

const mirrorHook = mirrorPublishAllLocalesFlagsToReq()
const preserveHook = preserveLocalesOnPublishAll()

type MirrorReq = {
  query: Record<string, string>
  locale?: string
}

describe('mirrorPublishAllLocalesFlagsToReq', () => {
  it('leaves global operations without arguments unchanged', async () => {
    const req: MirrorReq = { query: { locale: 'pl' } }

    expect(await mirrorHook({ req } as never)).toBeUndefined()
    expect(req.query).toEqual({ locale: 'pl' })
  })

  it('mirrors Local API publishAllLocales onto req.query', async () => {
    const req: MirrorReq = { query: { locale: 'pl' } }

    await mirrorHook({
      req,
      args: { publishAllLocales: true, req },
    } as never)

    expect(isPublishAllLocales(req)).toBe(true)
    expect(req.query).toEqual({ locale: 'pl', publishAllLocales: 'true' })
  })
})

describe('preserveLocalesOnPublishAll', () => {
  it('restores non-active locales from stored drafts on publish-all', async () => {
    const baseReq = {
      locale: 'pl',
      query: { locale: 'pl', publishAllLocales: 'true' },
      payload: {
        config: {
          localization: {
            locales: [
              { code: 'pl', label: 'PL' },
              { code: 'en', label: 'EN' },
              { code: 'de', label: 'DE' },
            ],
          },
        },
        findGlobal: async ({ locale }: { locale: string }) => {
          if (locale === 'de') return { title: 'MANUAL-MATRIX-FULL-HOME-DE-01' }
          if (locale === 'en') return { title: 'MANUAL-MATRIX-FULL-HOME-EN-01' }
          return { title: 'MANUAL-MATRIX-FULL-HOME-PL-03' }
        },
      },
    }

    const result = await preserveHook({
      data: {
        title: {
          pl: 'MANUAL-MATRIX-FULL-HOME-PL-04',
          en: 'MANUAL-MATRIX-FULL-HOME-EN-01',
          de: 'MANUAL-MATRIX-FULL-HOME-PL-04',
        },
        _status: 'published',
      },
      req: baseReq,
      originalDoc: { title: { pl: 'x', en: 'y', de: 'z' } },
      global: { slug: 'home-page', fields: [] },
    } as never)

    expect(result.title).toEqual({
      pl: 'MANUAL-MATRIX-FULL-HOME-PL-04',
      en: 'MANUAL-MATRIX-FULL-HOME-EN-01',
      de: 'MANUAL-MATRIX-FULL-HOME-DE-01',
    })
  })
})
