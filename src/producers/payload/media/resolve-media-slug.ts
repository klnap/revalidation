import type { CollectionConfig, Config } from 'payload'

export function collectionHasUpload(collection: CollectionConfig): boolean {
  const upload = collection.upload
  return upload === true || (typeof upload === 'object' && upload !== null)
}

/**
 * Upload collection for media-dependent revalidation hooks.
 * Explicit `media` → its slug; else sole upload collection; else slug `media`.
 */
export function resolveMediaSlug(
  incoming: Pick<Config, 'collections'>,
  media?: CollectionConfig,
): string | undefined {
  if (media?.slug) return media.slug

  const uploads = (incoming.collections ?? []).filter(collectionHasUpload)
  if (uploads.length === 1) return uploads[0]?.slug

  const named = uploads.find((c) => c.slug === 'media')
  return named?.slug
}
