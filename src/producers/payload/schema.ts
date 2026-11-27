import type { CloudEvent } from '../../core/cloudevents.js'
import type { RevalidationResource } from '../../core/event-selector.js'
import { resourceChangedEventType } from '../../core/resource-changed-schema.js'
import type { RevalidationChange } from './lifecycle/types.js'

const resourceFor = (change: RevalidationChange): RevalidationResource => {
  const id = change.doc.id
  const slug =
    change.routeSlug ?? (typeof change.doc.slug === 'string' ? change.doc.slug : undefined)
  return {
    type: change.type === 'collection' ? 'payload.collection' : 'payload.global',
    name: change.slug,
    ...(typeof id === 'string' || typeof id === 'number' ? { id: String(id) } : {}),
    locale: change.locale,
    ...(slug ? { slug } : {}),
    ...(change.identifiers ? { identifiers: change.identifiers } : {}),
  }
}

export const changesToRevalidationEvent = (
  changes: RevalidationChange[],
  source: string,
): CloudEvent => {
  const root = changes.find((change) => change.root) ?? changes[0]
  if (!root) throw new Error('Cannot create a Payload CloudEvent without changes')
  return {
    specversion: '1.0',
    id: `rev_${crypto.randomUUID()}`,
    source,
    type: resourceChangedEventType,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: {
      operation: root.operation,
      resource: resourceFor(root),
      affected: changes.map((change) => ({
        operation: change.operation,
        resource: resourceFor(change),
      })),
    },
  }
}
