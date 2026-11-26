import type { LegacyPayloadItem } from './legacy-payload-schema.js'
import type { RevalidationEvent, TagParamsBag } from './host-types.js'

export const defaultPayloadParams = (event: RevalidationEvent<LegacyPayloadItem>): TagParamsBag => {
  const item = event.item
  return {
    locale: item.locale,
    slug: item.slug,
    documentId: item.documentId,
  }
}
