import type { PayloadRevalidationItem } from '../../sources/payload/index.js'
import type { RevalidationEvent, TagParamsBag } from './host-types.js'

export const defaultPayloadParams = (
  event: RevalidationEvent<PayloadRevalidationItem>,
): TagParamsBag => {
  const item = event.item
  return {
    locale: item.locale,
    slug: item.slug,
    documentId: item.documentId,
  }
}
