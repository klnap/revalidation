import type { CollectionConfig, Config, GlobalConfig, Plugin } from 'payload'
import type { Dispatcher, DispatchInput, DispatchOutcome } from '../../core/index.js'
import {
  buildPluginExcludeFieldsBySlug,
  normalizeExcludeFields,
  readRevalidationExcludeFields,
} from './exclude-fields.js'
import {
  createCollectionRevalidateAfterChange,
  createCollectionRevalidateAfterDelete,
  createGlobalRevalidateAfterChange,
  type RevalidationHookOptions,
} from './lifecycle/revalidate.js'
import { resolveMediaSlug } from './media/resolve-media-slug.js'
import {
  createRevalidateMediaDependentsAfterChange,
  createRevalidateMediaDependentsBeforeDelete,
} from './media/revalidate-media-dependents.js'
import {
  mirrorPublishAllLocalesFlagsToReq,
  preserveLocalesOnPublishAll,
  restoreLocalesAfterPublishAll,
} from './publish-all/index.js'
import {
  normalizeCollectionRevalidation,
  normalizeGlobalRevalidation,
  readRevalidationCustom,
} from './revalidation-custom.js'

const REVALIDATION_PLUGIN_APPLIED = Symbol('revalidation plugin applied')
type ConfigWithRevalidationMarker = Config & {
  [REVALIDATION_PLUGIN_APPLIED]?: true
}

export type DispatcherSelection = Dispatcher | { default: Dispatcher; fallback?: Dispatcher }

export type MediaPluginConfig =
  | CollectionConfig
  | {
      collection: CollectionConfig
      excludeFields?: string[]
    }

export type PluginSchemaExcludeConfig = {
  /** Replaces plugin `excludeFields` for this slug when CMS schema omits its own list. */
  excludeFields?: string[]
}

export type PayloadRevalidationPluginConfig = {
  dispatcher: DispatcherSelection
  /** Absolute CloudEvents source URI. Defaults to `urn:klnap:revalidation:payload`. */
  source?: string
  /**
   * Upload collection for media-dependent hooks (optional).
   * Omitted → auto: only upload collection, or slug `media` among uploads.
   */
  media?: MediaPluginConfig
  enabled?: boolean
  /** Default exclude list when schema and per-slug plugin entries omit `excludeFields`. */
  excludeFields?: string[]
  /** Per collection slug — between CMS `custom` and plugin `excludeFields`. */
  collections?: Record<string, PluginSchemaExcludeConfig>
  /** Per global slug — same precedence as `collections` for globals. */
  globals?: Record<string, PluginSchemaExcludeConfig>
}

const resolveDispatcher = (selection: DispatcherSelection): Dispatcher => {
  if (!('default' in selection)) return selection

  const { default: primary, fallback } = selection
  if (!fallback) return primary

  return {
    maxEventItems: primary.maxEventItems,
    async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
      try {
        const first = await primary.dispatch(input)
        if (first.status === 'accepted') return first
        if (first.status === 'unknown' || first.status === 'rejected') return first
        return fallback.dispatch(input)
      } catch {
        return fallback.dispatch(input)
      }
    },
  }
}

const appendHook = <T>(existing: T[] | T | undefined, hook: T): T[] => {
  if (!existing) return [hook]
  return Array.isArray(existing) ? [...existing, hook] : [existing, hook]
}

const prependHook = <T>(existing: T[] | T | undefined, hook: T): T[] => {
  if (!existing) return [hook]
  return Array.isArray(existing) ? [hook, ...existing] : [hook, existing]
}

/** User hooks, then publish-all locale restore, then revalidation dispatch. */
const appendRevalidationAfterChange = <T>(
  existing: T[] | T | undefined,
  restore: T,
  revalidate: T,
): T[] => {
  const base = !existing ? [] : Array.isArray(existing) ? [...existing] : [existing]
  return [...base, restore, revalidate]
}

const resolveMediaPluginConfig = (media?: MediaPluginConfig) => {
  if (!media) return { collection: undefined, excludeFields: undefined }
  if ('collection' in media) {
    return {
      collection: media.collection,
      excludeFields: media.excludeFields,
    }
  }
  return { collection: media, excludeFields: undefined }
}

const validateRevalidationExcludeFieldsOnConfig = (
  incoming: Config,
  pluginExcludeFields?: readonly string[],
  pluginCollectionExcludeFields?: Readonly<Record<string, readonly string[]>>,
  pluginGlobalExcludeFields?: Readonly<Record<string, readonly string[]>>,
  mediaPluginExcludeFields?: readonly string[],
  mediaSlug?: string,
): void => {
  if (pluginExcludeFields?.length) {
    normalizeExcludeFields(pluginExcludeFields)
  }
  for (const [slug, paths] of Object.entries(pluginCollectionExcludeFields ?? {})) {
    const collection = (incoming.collections ?? []).find((c) => c.slug === slug)
    const meta = collection ? readRevalidationCustom(collection.custom) : null
    const identifiers =
      meta && meta !== true ? normalizeCollectionRevalidation(meta).identifiers : []
    normalizeExcludeFields(paths, { identifiers })
  }
  for (const paths of Object.values(pluginGlobalExcludeFields ?? {})) {
    normalizeExcludeFields(paths)
  }
  if (mediaPluginExcludeFields?.length) {
    normalizeExcludeFields(mediaPluginExcludeFields)
  }

  for (const collection of incoming.collections ?? []) {
    const meta = readRevalidationCustom(collection.custom)
    const identifiers =
      meta && meta !== true ? normalizeCollectionRevalidation(meta).identifiers : []
    const explicit = readRevalidationExcludeFields(collection.custom)
    if (explicit !== undefined) {
      normalizeExcludeFields(explicit, { identifiers })
    }
  }

  for (const global of incoming.globals ?? []) {
    const explicit = readRevalidationExcludeFields(global.custom)
    if (explicit !== undefined) {
      normalizeExcludeFields(explicit)
    }
  }

  if (mediaSlug) {
    const mediaCollection = (incoming.collections ?? []).find((c) => c.slug === mediaSlug)
    const explicit = readRevalidationExcludeFields(mediaCollection?.custom)
    if (explicit !== undefined) {
      normalizeExcludeFields(explicit)
    }
  }
}

/**
 * Payload plugin: `custom.revalidation` on collections/globals → events → dispatcher.
 * Opt-in via `custom.revalidation` (like draftMode). Fail-open on dispatch.
 */
export function revalidation(config: PayloadRevalidationPluginConfig): Plugin {
  const enabled = config.enabled !== false
  const resolvedDispatcher = resolveDispatcher(config.dispatcher)
  if (config.source) {
    try {
      new URL(config.source)
    } catch {
      throw new TypeError('revalidation: source must be an absolute URI')
    }
  }
  const dispatcher: Dispatcher = config.source
    ? {
        maxEventItems: resolvedDispatcher.maxEventItems,
        dispatch: (input) =>
          resolvedDispatcher.dispatch({
            ...input,
            events: input.events.map((event) => ({ ...event, source: config.source! })),
          }),
      }
    : resolvedDispatcher
  const pluginExcludeFields = config.excludeFields
  const pluginCollectionExcludeFields = buildPluginExcludeFieldsBySlug(config.collections)
  const pluginGlobalExcludeFields = buildPluginExcludeFieldsBySlug(config.globals)
  const { collection: mediaCollectionOverride, excludeFields: mediaPluginExcludeFields } =
    resolveMediaPluginConfig(config.media)
  const hookOptions: RevalidationHookOptions = {
    pluginExcludeFields,
    pluginCollectionExcludeFields,
    pluginGlobalExcludeFields,
  }
  const mediaHookOptions = {
    pluginExcludeFields,
    pluginCollectionExcludeFields,
    mediaPluginExcludeFields,
  }

  return (incoming: Config): Config => {
    if (!enabled) return incoming
    if ((incoming as ConfigWithRevalidationMarker)[REVALIDATION_PLUGIN_APPLIED]) {
      throw new Error('revalidation: plugin is already applied to this Payload config')
    }

    const mediaSlug = resolveMediaSlug(incoming, mediaCollectionOverride)

    validateRevalidationExcludeFieldsOnConfig(
      incoming,
      pluginExcludeFields,
      pluginCollectionExcludeFields,
      pluginGlobalExcludeFields,
      mediaPluginExcludeFields,
      mediaSlug,
    )

    const mirrorPublishAllLocalesToReq = mirrorPublishAllLocalesFlagsToReq()
    const preserveLocalesBeforeChange = preserveLocalesOnPublishAll()
    const restoreLocalesAfterChange = restoreLocalesAfterPublishAll()
    const collectionAfterChange = createCollectionRevalidateAfterChange(dispatcher, hookOptions)
    const collectionAfterDelete = createCollectionRevalidateAfterDelete(dispatcher, hookOptions)
    const globalAfterChange = createGlobalRevalidateAfterChange(dispatcher, hookOptions)
    const mediaAfterChange = createRevalidateMediaDependentsAfterChange(
      dispatcher,
      mediaHookOptions,
    )
    const mediaBeforeDelete = createRevalidateMediaDependentsBeforeDelete(dispatcher)

    const collections = (incoming.collections ?? []).map((collection: CollectionConfig) => {
      if (mediaSlug && collection.slug === mediaSlug) {
        return {
          ...collection,
          hooks: {
            ...collection.hooks,
            afterChange: appendHook(collection.hooks?.afterChange, mediaAfterChange),
            beforeDelete: appendHook(collection.hooks?.beforeDelete, mediaBeforeDelete),
          },
        }
      }

      const meta = readRevalidationCustom(collection.custom)
      if (!meta) return collection

      const opts = normalizeCollectionRevalidation(meta)
      let next = {
        ...collection,
        hooks: {
          ...collection.hooks,
          beforeOperation: prependHook(
            collection.hooks?.beforeOperation,
            mirrorPublishAllLocalesToReq,
          ),
          beforeChange: prependHook(collection.hooks?.beforeChange, preserveLocalesBeforeChange),
        },
      }
      if (opts.hooks.includes('afterChange')) {
        next = {
          ...next,
          hooks: {
            ...next.hooks,
            afterChange: appendRevalidationAfterChange(
              next.hooks?.afterChange,
              restoreLocalesAfterChange,
              collectionAfterChange,
            ),
          },
        }
      }
      if (opts.hooks.includes('afterDelete')) {
        next = {
          ...next,
          hooks: {
            ...next.hooks,
            afterDelete: appendHook(next.hooks?.afterDelete, collectionAfterDelete),
          },
        }
      }
      return next
    })

    const globals = (incoming.globals ?? []).map((global: GlobalConfig) => {
      const meta = readRevalidationCustom(global.custom)
      if (!meta) return global

      const opts = normalizeGlobalRevalidation(meta)
      if (!opts.hooks.includes('afterChange')) return global

      return {
        ...global,
        hooks: {
          ...global.hooks,
          beforeOperation: prependHook(global.hooks?.beforeOperation, mirrorPublishAllLocalesToReq),
          beforeChange: prependHook(global.hooks?.beforeChange, preserveLocalesBeforeChange),
          afterChange: appendRevalidationAfterChange(
            global.hooks?.afterChange,
            restoreLocalesAfterChange,
            globalAfterChange,
          ),
        },
      }
    })

    const nextConfig = {
      ...incoming,
      collections,
      globals,
    } as ConfigWithRevalidationMarker
    Object.defineProperty(nextConfig, REVALIDATION_PLUGIN_APPLIED, {
      value: true,
      enumerable: true,
    })
    return nextConfig
  }
}
