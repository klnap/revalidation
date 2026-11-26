export const CLOUDEVENTS_JSON = 'application/cloudevents+json'
export const CLOUDEVENTS_BATCH_JSON = 'application/cloudevents-batch+json'

export type CloudEvent<TData = unknown> = {
  specversion: '1.0'
  id: string
  source: string
  type: string
  time?: string | null
  subject?: string | null
  datacontenttype?: string | null
  dataschema?: string | null
  data: TData
  [extension: string]: unknown
}

export class CloudEventParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CloudEventParseError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isAbsoluteUri = (value: string): boolean => {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const isTimestamp = (value: string): boolean => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    )
  if (!match) return false
  const [, year, month, day, hour, minute, second, , , offsetHour, offsetMinute] = match
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const h = Number(hour)
  const min = Number(minute)
  const s = Number(second)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return (
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= daysInMonth &&
    h <= 23 &&
    min <= 59 &&
    s <= 59 &&
    Number(offsetHour ?? 0) <= 23 &&
    Number(offsetMinute ?? 0) <= 59 &&
    Number.isFinite(Date.parse(value))
  )
}

const isJsonContentType = (value: string): boolean => {
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase()
  if (!mediaType || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(mediaType)) {
    return false
  }

  return value
    .split(';')
    .slice(1)
    .every((parameter) =>
      /^\s*[a-z0-9!#$&^_.+-]+\s*=\s*(?:[a-z0-9!#$&^_.+-]+|"[^"]*")\s*$/i.test(parameter),
    )
}

const isJsonExtensionValue = (value: unknown): boolean =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value))

const validateEvent = (value: unknown): CloudEvent => {
  if (!isRecord(value)) throw new CloudEventParseError('CloudEvent must be a JSON object')
  if (value.specversion !== '1.0') {
    throw new CloudEventParseError('CloudEvent specversion must be "1.0"')
  }
  if (!isNonEmptyString(value.id)) throw new CloudEventParseError('CloudEvent id is required')
  if (!isNonEmptyString(value.source) || !isAbsoluteUri(value.source)) {
    throw new CloudEventParseError('CloudEvent source must be an absolute URI')
  }
  if (!isNonEmptyString(value.type)) throw new CloudEventParseError('CloudEvent type is required')
  if (!Object.hasOwn(value, 'data') || typeof value.data === 'undefined') {
    throw new CloudEventParseError('CloudEvent data is required')
  }
  if (Object.hasOwn(value, 'data_base64')) {
    throw new CloudEventParseError('CloudEvent data_base64 is not supported')
  }
  if (value.subject !== undefined && typeof value.subject !== 'string') {
    throw new CloudEventParseError('CloudEvent subject must be a string')
  }
  if (value.time !== undefined) {
    if (typeof value.time !== 'string' || !isTimestamp(value.time)) {
      throw new CloudEventParseError('CloudEvent time must be an RFC 3339 timestamp')
    }
  }
  if (
    value.datacontenttype !== undefined &&
    (typeof value.datacontenttype !== 'string' || !isJsonContentType(value.datacontenttype))
  ) {
    throw new CloudEventParseError('CloudEvent datacontenttype must describe JSON')
  }
  if (
    value.dataschema !== undefined &&
    (typeof value.dataschema !== 'string' || !isAbsoluteUri(value.dataschema))
  ) {
    throw new CloudEventParseError('CloudEvent dataschema must be an absolute URI')
  }

  const standardAttributes = new Set([
    'specversion',
    'id',
    'source',
    'type',
    'time',
    'subject',
    'datacontenttype',
    'dataschema',
    'data',
  ])
  for (const [name, extensionValue] of Object.entries(value)) {
    if (standardAttributes.has(name)) continue
    if (!/^[a-z0-9]{1,20}$/.test(name) || !isJsonExtensionValue(extensionValue)) {
      throw new CloudEventParseError(`CloudEvent extension attribute "${name}" is invalid`)
    }
  }

  return value as CloudEvent
}

const normalizeMediaType = (contentType: string): string =>
  contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''

export const parseCloudEvents = (value: unknown, contentType: string): CloudEvent[] => {
  const mediaType = normalizeMediaType(contentType)

  if (mediaType === CLOUDEVENTS_JSON) {
    if (!isJsonContentType(contentType) || Array.isArray(value)) {
      throw new CloudEventParseError('Expected one CloudEvent JSON object')
    }
    return [validateEvent(value)]
  }

  if (mediaType === CLOUDEVENTS_BATCH_JSON) {
    if (!isJsonContentType(contentType) || !Array.isArray(value)) {
      throw new CloudEventParseError('Expected a CloudEvents JSON batch')
    }
    return value.map(validateEvent)
  }

  throw new CloudEventParseError('Unsupported CloudEvents content type')
}
