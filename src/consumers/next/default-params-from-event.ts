import { assertTagValue } from '../../core/param-values.js'
import type { RevalidationEvent, TagParamsBag } from './host-types.js'

export const defaultParamsFromEvent = (
  event: RevalidationEvent,
  templateKeys: readonly string[],
): TagParamsBag => {
  const record = event.item as Record<string, unknown>
  const params: TagParamsBag = {}

  for (const key of templateKeys) {
    const fromEvent = (event as Record<string, unknown>)[key]
    if (typeof fromEvent === 'string' && fromEvent.length > 0) {
      assertTagValue(key, fromEvent)
      params[key] = fromEvent
      continue
    }
    const fromItem = record[key]
    if (typeof fromItem === 'string' && fromItem.length > 0) {
      assertTagValue(key, fromItem)
      params[key] = fromItem
    }
  }

  return params
}
