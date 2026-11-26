import type { CloudEvent } from './cloudevents.js'

export type Operation = 'create' | 'update' | 'delete'

export type RevalidationResource = {
  type: string
  name?: string
  id?: string
  locale?: string
  slug?: string
  identifiers?: Record<string, string>
}

export type AffectedResource = {
  operation: Operation
  resource: RevalidationResource
}

type Selectable<T extends string> = T | readonly T[]

export type ResourceSelector = {
  type?: Selectable<string>
  name?: Selectable<string>
  id?: Selectable<string>
  locale?: Selectable<string>
}

export type AffectedResourceSelector = ResourceSelector & {
  operation?: Selectable<Operation>
}

export type EventSelector = {
  source?: Selectable<string>
  type?: Selectable<string>
  operation?: Selectable<Operation>
  resource?: ResourceSelector
  affected?: AffectedResourceSelector
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const includes = <T extends string>(expected: Selectable<T>, actual: unknown): boolean =>
  typeof expected === 'string'
    ? expected === actual
    : expected.some((candidate) => candidate === actual)

const matchesResource = (
  resource: unknown,
  selector: ResourceSelector,
): resource is RevalidationResource => {
  if (!isRecord(resource)) return false

  for (const key of ['type', 'name', 'id', 'locale'] as const) {
    const expected = selector[key]
    if (expected !== undefined && !includes(expected, resource[key])) return false
  }

  return true
}

export const matchingAffectedResources = (
  event: CloudEvent,
  selector: Pick<EventSelector, 'affected'> = {},
): AffectedResource[] => {
  if (!isRecord(event.data) || !Array.isArray(event.data.affected)) return []

  return event.data.affected.filter((entry: unknown): entry is AffectedResource => {
    if (!isRecord(entry) || !isRecord(entry.resource)) return false
    if (!selector.affected) return true
    return (
      matchesResource(entry.resource, selector.affected) &&
      (selector.affected.operation === undefined ||
        includes(selector.affected.operation, entry.operation))
    )
  })
}

export const matchesEventSelector = (event: CloudEvent, selector: EventSelector): boolean => {
  if (selector.source !== undefined && !includes(selector.source, event.source)) return false
  if (selector.type !== undefined && !includes(selector.type, event.type)) return false

  if (
    selector.operation !== undefined &&
    (!isRecord(event.data) || !includes(selector.operation, event.data.operation))
  ) {
    return false
  }

  if (
    selector.resource &&
    (!isRecord(event.data) || !matchesResource(event.data.resource, selector.resource))
  ) {
    return false
  }

  if (selector.affected && matchingAffectedResources(event, selector).length === 0) return false
  return true
}
