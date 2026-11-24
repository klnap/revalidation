import type { PayloadRequest } from 'payload'
import type { ResolveExcludeFieldsInput } from '../exclude-fields.js'
import { resolveExcludeFields } from '../exclude-fields.js'
import {
  docsContentEqual,
  getRequestLocale,
  listLocales,
  MEDIA_LOCALIZED_KEYS,
  mediaSharedFieldsEqual,
  type RevalidateArgs,
  resolveChangedLocales,
  toTypedLocale,
} from '../lifecycle/helpers.js'

type ResolveArgs = {
  doc: Record<string, unknown>
  previousDoc?: Record<string, unknown>
  req: PayloadRequest
  mediaId: number | string
  mediaCollectionSlug: string
  mediaSchemaCustom?: unknown
  pluginExcludeFields?: readonly string[]
  pluginCollectionExcludeFields?: ResolveExcludeFieldsInput['pluginCollectionExcludeFields']
  mediaPluginExcludeFields?: readonly string[]
}

const buildExcludeOptions = ({
  mediaSchemaCustom,
  mediaCollectionSlug,
  pluginExcludeFields,
  pluginCollectionExcludeFields,
  mediaPluginExcludeFields,
}: Pick<
  ResolveArgs,
  | 'mediaSchemaCustom'
  | 'mediaCollectionSlug'
  | 'pluginExcludeFields'
  | 'pluginCollectionExcludeFields'
  | 'mediaPluginExcludeFields'
>): ResolveExcludeFieldsInput => ({
  isMediaDependent: true,
  mediaSchemaCustom,
  collectionSlug: mediaCollectionSlug,
  pluginExcludeFields,
  pluginCollectionExcludeFields,
  mediaPluginExcludeFields,
})

/**
 * Which locales need parent revalidation after a media update.
 *
 * - Shared fields changed (file/url/focal) → all locales
 * - Only localized fields (alt) → locales where media content actually changed
 * - No change → empty (caller skips POST)
 */
export const resolveMediaAffectedLocales = async ({
  doc,
  previousDoc,
  req,
  mediaId,
  mediaCollectionSlug,
  mediaSchemaCustom,
  pluginExcludeFields,
  pluginCollectionExcludeFields,
  mediaPluginExcludeFields,
}: ResolveArgs): Promise<string[]> => {
  const excludeFields = resolveExcludeFields(
    buildExcludeOptions({
      mediaSchemaCustom,
      mediaCollectionSlug,
      pluginExcludeFields,
      pluginCollectionExcludeFields,
      mediaPluginExcludeFields,
    }),
  )
  const contentOptions = { excludeFields }
  const sharedExclude = [...new Set([...excludeFields, ...MEDIA_LOCALIZED_KEYS])]
  const sharedOptions = { excludeFields: sharedExclude }

  const locales = listLocales(req)
  const editedLocale = getRequestLocale(req)

  const candidates = resolveChangedLocales({
    args: {
      operation: 'update',
      req,
      doc,
      previousDoc,
      collection: { slug: 'media' },
    } as RevalidateArgs,
    locales,
  })

  if (!candidates.length) return []

  if (previousDoc && !mediaSharedFieldsEqual(doc, previousDoc, sharedOptions)) {
    return locales
  }

  if (
    previousDoc &&
    candidates.length === 1 &&
    docsContentEqual(doc, previousDoc, contentOptions)
  ) {
    return []
  }

  const affected: string[] = []

  for (const locale of candidates) {
    const current =
      editedLocale === locale
        ? doc
        : ((await req.payload.findByID({
            collection: 'media',
            id: mediaId,
            locale: toTypedLocale(locale),
            fallbackLocale: false,
            depth: 0,
            overrideAccess: true,
          })) as Record<string, unknown>)

    const previous = editedLocale === locale && previousDoc ? previousDoc : undefined

    if (previous && docsContentEqual(current, previous, contentOptions)) {
      continue
    }

    affected.push(locale)
  }

  return affected
}
