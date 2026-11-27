import { describe, expect, it } from 'bun:test'
import { runRevalidationHookFailOpen } from './revalidate.js'

describe('read errors while building an event', () => {
  it('are logged and do not reject the save', async () => {
    const errors: string[] = []
    const logger = { info: () => {}, warn: () => {}, error: (m: string) => errors.push(m) }
    const failing = async () => {
      throw new Error('database unavailable')
    }
    const args = {
      doc: { id: 1, slug: 'a', _status: 'published' },
      previousDoc: { id: 1, slug: 'a', _status: 'published' },
      operation: 'update',
      req: {
        payload: {
          logger,
          findByID: failing,
          find: failing,
          config: { localization: { locales: [{ code: 'en' }], defaultLocale: 'en' } },
          collections: {},
        },
        locale: 'en',
        context: {},
        query: {},
      },
      collection: {
        slug: 'pages',
        custom: { revalidation: true },
        versions: { drafts: false },
        fields: [],
      },
    } as never

    const dispatcher = {
      dispatch: async () => ({ status: 'accepted' as const, results: [] }),
    }
    await expect(
      runRevalidationHookFailOpen(args, dispatcher, {
        source: 'https://cms.example/revalidation',
      }),
    ).resolves.toBeUndefined()
    expect(errors.some((m) => m.includes('database unavailable'))).toBe(true)
  })
})
