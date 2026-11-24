import { describe, expect, it } from 'bun:test'
import { revalidationOrderableHooks } from '../../../src/producers/payload/lifecycle/orderable-hooks'

describe('revalidationOrderableHooks', () => {
  it('marks a global reorder as order-only and all-locales on the request', () => {
    const hooks = revalidationOrderableHooks()
    const req = { context: {} as Record<string, unknown> }
    hooks.beforeWrite(req, { orderScope: 'global' })
    expect(req.context.__revalidationAllLocales).toBe(true)
    expect(req.context.__revalidationOrderOnly).toBe(true)
  })

  it('marks a locale reorder as order-only without all-locales', () => {
    const hooks = revalidationOrderableHooks()
    const req = { context: {} as Record<string, unknown> }
    hooks.beforeWrite(req, { orderScope: 'locale' })
    expect(req.context.__revalidationAllLocales).toBeUndefined()
    expect(req.context.__revalidationOrderOnly).toBe(true)
  })

  it('resolves committed and rolled-back requests without throwing when nothing was queued', async () => {
    const hooks = revalidationOrderableHooks()
    const req = { context: {} }
    await expect(hooks.onCommitted({}, req)).resolves.toBeUndefined()
    expect(() => hooks.onRolledBack(new Error('x'), req)).not.toThrow()
  })
})
