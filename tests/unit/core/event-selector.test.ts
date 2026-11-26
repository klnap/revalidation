import { describe, expect, it } from 'bun:test'
import type { CloudEvent } from '../../../src/core/cloudevents.ts'
import {
  matchesEventSelector,
  matchingAffectedResources,
} from '../../../src/core/event-selector.ts'

const event: CloudEvent = {
  specversion: '1.0',
  id: 'rev_1',
  source: 'urn:example:cms',
  type: 'com.example.resource.changed.v1',
  data: {
    operation: 'delete',
    resource: { type: 'payload.collection', name: 'media', id: 'm1' },
    affected: [
      {
        operation: 'delete',
        resource: { type: 'payload.collection', name: 'media', id: 'm1' },
      },
      {
        operation: 'update',
        resource: { type: 'payload.collection', name: 'pages', id: 'p1', locale: 'en' },
      },
    ],
  },
}

describe('event selectors', () => {
  it('combines selector fields with AND and list values with OR', () => {
    expect(
      matchesEventSelector(event, {
        source: ['urn:other:cms', 'urn:example:cms'],
        type: 'com.example.resource.changed.v1',
        operation: ['create', 'delete'],
        resource: { type: 'payload.collection', name: 'media' },
      }),
    ).toBe(true)

    expect(
      matchesEventSelector(event, {
        operation: 'update',
        resource: { name: 'media' },
      }),
    ).toBe(false)
  })

  it('matches any affected resource and returns only matching affected entries', () => {
    const selector = {
      affected: {
        type: 'payload.collection',
        name: 'pages',
        operation: 'update' as const,
        locale: 'en',
      },
    }

    expect(matchesEventSelector(event, selector)).toBe(true)
    expect(matchingAffectedResources(event, selector)).toEqual([
      {
        operation: 'update',
        resource: { type: 'payload.collection', name: 'pages', id: 'p1', locale: 'en' },
      },
    ])
  })

  it('does not match an affected selector when no affected resource matches', () => {
    expect(
      matchesEventSelector(event, {
        affected: { type: 'payload.global', name: 'settings' },
      }),
    ).toBe(false)
  })

  it('matches custom CloudEvents by source and type without interpreting their data', () => {
    const custom = { ...event, data: { key: 'catalog' } }

    expect(matchesEventSelector(custom, { source: event.source })).toBe(true)
    expect(matchesEventSelector(custom, { affected: { type: 'payload.collection' } })).toBe(false)
  })
})
