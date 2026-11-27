import { describe, expect, it, mock } from 'bun:test'

import { postRevalidationChanges } from './dispatch.ts'

const source = 'https://cms.example/revalidation'

describe('producer fail-open dispatch', () => {
  it('does not throw when dispatcher returns failed', async () => {
    const errorLog = mock(() => {})

    await expect(
      postRevalidationChanges({
        changes: [
          {
            type: 'global',
            slug: 'home-page',
            operation: 'update',
            locale: 'en',
            doc: { id: '1', title: 'Hi' },
          },
        ],
        source,
        logger: { error: errorLog },
        dispatcher: {
          dispatch: async () => ({
            status: 'failed',
            results: [
              {
                target: 'website',
                deliveryId: 'wh_1',
                status: 'failed',
                attempts: 1,
                error: { code: 'HTTP_DISPATCH_ERROR', message: 'network down' },
              },
            ],
          }),
        },
      }),
    ).resolves.toBeUndefined()

    expect(errorLog).toHaveBeenCalled()
  })
})
