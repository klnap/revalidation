import { describe, expect, it } from 'bun:test'

import { assertLimit, MAX_EVENT_ITEMS_CEILING } from '../../../src/core/event-limits'

describe('assertLimit', () => {
  it('accepts integers from 1 up to the ceiling', () => {
    expect(assertLimit('maxEvents', 1, 1000)).toBe(1)
    expect(assertLimit('maxEvents', 1000, 1000)).toBe(1000)
  })

  it('rejects zero, negatives, fractions, and values above the ceiling', () => {
    for (const value of [0, -1, 1.5, Number.NaN, 1001]) {
      expect(() => assertLimit('maxEvents', value, MAX_EVENT_ITEMS_CEILING)).toThrow(RangeError)
    }
  })

  it('names the option and the bound in the message', () => {
    expect(() => assertLimit('maxBodyBytes', 2, 1)).toThrow(
      'maxBodyBytes must be an integer from 1 to 1; got 2',
    )
  })
})
