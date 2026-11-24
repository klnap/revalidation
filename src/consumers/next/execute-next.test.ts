import { beforeEach, describe, expect, it, mock } from 'bun:test'

const revalidateTag = mock(() => {})
const revalidatePath = mock(() => {})
mock.module('next/cache.js', () => ({ revalidateTag, revalidatePath }))

const { executeNextLayer } = await import('./execute-next.js')

beforeEach(() => {
  revalidateTag.mockClear()
  revalidatePath.mockClear()
})

describe('executeNextLayer', () => {
  it('maps freshness modes to the matching Next.js invalidation APIs', async () => {
    await executeNextLayer({
      tags: [
        { value: 'stale-tag', mode: 'stale' },
        { value: 'expire-tag', mode: 'expire' },
      ],
      paths: [{ value: '/projects/tower', mode: 'expire' }],
    })

    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'stale-tag', 'max')
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'expire-tag', { expire: 0 })
    expect(revalidatePath).toHaveBeenCalledWith('/projects/tower')
  })

  it('accepts a tag at Next.js’s 256-character limit', async () => {
    const tag = 'a'.repeat(256)

    await executeNextLayer({ tags: [{ value: tag, mode: 'expire' }], paths: [] })

    expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 })
  })

  it('rejects tags longer than Next.js allows before invalidating any target', async () => {
    await expect(
      executeNextLayer({
        tags: [{ value: `en:work:${'a'.repeat(249)}`, mode: 'expire' }],
        paths: [],
      }),
    ).rejects.toThrow(/tag.*256/i)

    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects paths longer than Next.js allows before invalidating any target', async () => {
    await expect(
      executeNextLayer({
        tags: [{ value: 'safe-tag', mode: 'expire' }],
        paths: [{ value: `/${'a'.repeat(1024)}`, mode: 'expire' }],
      }),
    ).rejects.toThrow(/path.*1024/i)

    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
