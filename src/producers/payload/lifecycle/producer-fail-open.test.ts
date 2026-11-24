import { describe, expect, it, mock } from 'bun:test'

import { postRevalidationChanges } from './dispatch.ts'

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
        logger: { error: errorLog },
        dispatcher: {
          dispatch: async () => ({
            status: 'failed',
            error: { code: 'HTTP_DISPATCH_ERROR', message: 'network down' },
          }),
        },
      }),
    ).resolves.toBeUndefined()

    expect(errorLog).toHaveBeenCalled()
  })
})
