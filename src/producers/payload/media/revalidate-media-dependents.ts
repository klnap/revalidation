import type { CollectionAfterChangeHook, CollectionBeforeDeleteHook } from 'payload'

import type { Dispatcher } from '../../../core/index.js'
import {
  dispatchRevalidationChanges,
  isDraftSave,
  listLocales,
  logRevalidateDispatch,
  mediaSubject,
  revalidationLog,
  revalidationLogError,
  uniqueLocalesFromChanges,
} from '../lifecycle/helpers.js'
import { resolveMediaAffectedLocales } from './resolve-media-affected-locales.js'
import {
  type MediaDependencyFailure,
  resolveMediaDependentChanges,
} from './resolve-media-dependents.js'

type MediaOptions = {
  source: string
  pluginExcludeFields?: readonly string[]
  pluginCollectionExcludeFields?: Readonly<Record<string, readonly string[]>>
  mediaPluginExcludeFields?: readonly string[]
}

const errorDetail = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const logResolutionFailures = (
  logger: Parameters<typeof revalidationLogError>[0],
  subject: string,
  failures: MediaDependencyFailure[],
): void => {
  for (const failure of failures) {
    const locale = failure.locale ? ` · locale:${failure.locale}` : ''
    revalidationLogError(
      logger,
      `media dependency resolution incomplete · ${failure.refSlug}${locale} · ${errorDetail(failure.error)}`,
      subject,
    )
  }
}

/** Fail-open like parent revalidation: a read error is logged and does not reject the media save. */
const updateAfterChange = async (
  args: Parameters<CollectionAfterChangeHook>[0],
  dispatcher: Dispatcher,
  options: MediaOptions,
): Promise<void> => {
  const { doc, previousDoc, operation, req, collection } = args
  if (operation !== 'update') return

  const mediaId = doc.id
  if (mediaId === undefined || mediaId === null) return

  const subject = mediaSubject(mediaId)

  if (isDraftSave(req)) {
    revalidationLog.skip(req.payload.logger, subject, 'autosave')
    return
  }

  const affectedLocales = await resolveMediaAffectedLocales({
    doc: doc as Record<string, unknown>,
    previousDoc: previousDoc as Record<string, unknown> | undefined,
    req,
    mediaId,
    mediaCollectionSlug: collection.slug,
    mediaSchemaCustom: collection.custom,
    pluginExcludeFields: options.pluginExcludeFields,
    pluginCollectionExcludeFields: options.pluginCollectionExcludeFields,
    mediaPluginExcludeFields: options.mediaPluginExcludeFields,
  })

  if (!affectedLocales.length) {
    revalidationLog.skip(req.payload.logger, subject, 'unchanged')
    return
  }

  const resolution = await resolveMediaDependentChanges({
    mediaId,
    mediaSlug: collection.slug,
    payload: req.payload,
    req,
    locales: affectedLocales,
    operation: 'update',
  })
  logResolutionFailures(req.payload.logger, subject, resolution.failures)

  if (!resolution.changes.length) {
    if (!resolution.complete) return
    revalidationLog.skip(req.payload.logger, subject, 'no references')
    return
  }

  const { changes } = resolution
  const posted = uniqueLocalesFromChanges(changes.map((c) => c.locale))
  logRevalidateDispatch(req.payload.logger, subject, posted)

  await dispatchRevalidationChanges({
    req,
    changes: [
      {
        root: true,
        type: 'collection',
        slug: collection.slug,
        operation,
        locale: changes[0]!.locale,
        doc: doc as Record<string, unknown>,
      },
      ...changes,
    ],
    logger: req.payload.logger,
    source: options.source,
    dispatcher,
  })
}

export const createRevalidateMediaDependentsAfterChange = (
  dispatcher: Dispatcher,
  options: MediaOptions,
): CollectionAfterChangeHook => {
  return async (args) => {
    try {
      await updateAfterChange(args, dispatcher, options)
    } catch (error) {
      revalidationLogError(args.req.payload.logger, errorDetail(error), 'build')
    }
    return args.doc
  }
}

export const createRevalidateMediaDependentsBeforeDelete = (
  dispatcher: Dispatcher,
  source: string,
): CollectionBeforeDeleteHook => {
  return async ({ id, req, collection }) => {
    const subject = mediaSubject(id)
    try {
      const locales = listLocales(req)
      const resolution = await resolveMediaDependentChanges({
        mediaId: id,
        mediaSlug: collection.slug,
        payload: req.payload,
        req,
        locales,
        operation: 'update',
      })
      logResolutionFailures(req.payload.logger, subject, resolution.failures)

      if (!resolution.changes.length) {
        if (!resolution.complete) return
        revalidationLog.skip(req.payload.logger, subject, 'no references')
        return
      }

      const { changes } = resolution
      const posted = uniqueLocalesFromChanges(changes.map((c) => c.locale))
      logRevalidateDispatch(req.payload.logger, subject, posted)

      await dispatchRevalidationChanges({
        req,
        changes: [
          {
            root: true,
            type: 'collection',
            slug: collection.slug,
            operation: 'delete',
            locale: changes[0]!.locale,
            doc: { id },
          },
          ...changes,
        ],
        logger: req.payload.logger,
        source,
        dispatcher,
      })
    } catch (error) {
      revalidationLogError(req.payload.logger, errorDetail(error), 'build')
    }
  }
}
