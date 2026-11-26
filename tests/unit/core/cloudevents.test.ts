import { describe, expect, it } from 'bun:test'
import { parseCloudEvents, type CloudEvent } from '../../../src/core/cloudevents.ts'

const event: CloudEvent = {
  specversion: '1.0',
  id: 'rev_123',
  source: 'urn:example:cms',
  type: 'com.example.resource.changed.v1',
  time: '2026-11-26T12:00:00.000Z',
  datacontenttype: 'application/json',
  data: { operation: 'update' },
}

describe('parseCloudEvents', () => {
  it('accepts one structured JSON CloudEvent', () => {
    expect(parseCloudEvents(event, 'application/cloudevents+json')).toEqual([event])
  })

  it('accepts a CloudEvents batch and media type parameters', () => {
    expect(
      parseCloudEvents(
        [event, { ...event, id: 'rev_456' }],
        'Application/CloudEvents-Batch+Json; charset=utf-8',
      ),
    ).toEqual([event, { ...event, id: 'rev_456' }])
  })

  it('accepts an empty batch', () => {
    expect(parseCloudEvents([], 'application/cloudevents-batch+json')).toEqual([])
  })

  it('rejects a body shape that does not match the content type', () => {
    expect(() => parseCloudEvents([event], 'application/cloudevents+json')).toThrow()
    expect(() => parseCloudEvents(event, 'application/cloudevents-batch+json')).toThrow()
  })

  it('rejects missing required attributes and missing data', () => {
    const { source: _source, ...withoutSource } = event
    const { data: _data, ...withoutData } = event

    expect(() => parseCloudEvents(withoutSource, 'application/cloudevents+json')).toThrow()
    expect(() => parseCloudEvents(withoutData, 'application/cloudevents+json')).toThrow()
  })

  it('rejects non-JSON content and unsupported CloudEvents versions', () => {
    expect(() => parseCloudEvents(event, 'application/json')).toThrow()
    expect(() =>
      parseCloudEvents({ ...event, specversion: '0.3' }, 'application/cloudevents+json'),
    ).toThrow()
  })

  it('rejects data_base64 in this JSON-only profile', () => {
    expect(() =>
      parseCloudEvents({ ...event, data_base64: 'AQID' }, 'application/cloudevents+json'),
    ).toThrow()
  })

  it('accepts valid scalar extension attributes', () => {
    expect(
      parseCloudEvents(
        { ...event, traceid: 'abc', attempt: 2.5, retry: true },
        'application/cloudevents+json',
      ),
    ).toHaveLength(1)
  })

  it('rejects invalid extension attributes and non-JSON data content types', () => {
    expect(() =>
      parseCloudEvents({ ...event, TraceId: 'abc' }, 'application/cloudevents+json'),
    ).toThrow()
    expect(() =>
      parseCloudEvents({ ...event, traceid: { value: 'abc' } }, 'application/cloudevents+json'),
    ).toThrow()
    expect(() =>
      parseCloudEvents({ ...event, datacontenttype: 'text/plain' }, 'application/cloudevents+json'),
    ).toThrow()
  })

  it('rejects malformed RFC 3339 timestamps and null optional attributes', () => {
    expect(() =>
      parseCloudEvents({ ...event, time: '2026-02-30T12:00:00Z' }, 'application/cloudevents+json'),
    ).toThrow()
    expect(() =>
      parseCloudEvents({ ...event, subject: null }, 'application/cloudevents+json'),
    ).toThrow()
  })
})
