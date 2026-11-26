import { describe, expect, it } from 'bun:test'
import { payloadEventType, payloadSchema, payloadSource } from './index.ts'

describe('Payload CloudEvents source', () => {
  it('exports a source URI, event type, and Standard Schema V1 validator', () => {
    expect(payloadSource).toBe('urn:klnap:revalidation:payload')
    expect(payloadEventType).toBe('com.klnap.revalidation.resource.changed.v1')
    expect(
      payloadSchema['~standard'].validate({
        operation: 'update',
        resource: { type: 'payload.collection', name: 'pages' },
        affected: [
          {
            operation: 'update',
            resource: { type: 'payload.collection', name: 'pages', locale: 'en' },
          },
        ],
      }),
    ).toHaveProperty('value')
  })

  it('rejects data that does not match the Payload resource profile', async () => {
    const result = await payloadSchema['~standard'].validate({
      operation: 'publish',
      resource: { type: 'payload.collection' },
      affected: [],
    })
    expect(result).toHaveProperty('issues')
  })
})
