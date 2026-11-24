import { describe, expect, it } from 'bun:test'

import type { CompiledLayerRule } from './compile-revalidation-host.ts'
import { findMatchingRules } from './match-layer-rules.ts'

describe('findMatchingRules', () => {
  const rules: CompiledLayerRule[] = [
    { key: { payload: 'projects', medusa: 'medusa:product' }, tagIds: ['a'], pathIds: [] },
    { key: { payload: 'home-page' }, tagIds: ['b'], pathIds: [] },
  ]

  it('matches payload key', () => {
    expect(findMatchingRules('payload', 'projects', rules)).toHaveLength(1)
    expect(findMatchingRules('payload', 'projects', rules)[0]?.tagIds).toEqual(['a'])
  })

  it('matches medusa key on same rule', () => {
    expect(findMatchingRules('medusa', 'medusa:product', rules)).toHaveLength(1)
  })

  it('returns empty when cache key differs', () => {
    expect(findMatchingRules('payload', 'about-page', rules)).toHaveLength(0)
  })
})
