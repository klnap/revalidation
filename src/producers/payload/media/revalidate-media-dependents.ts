import type { CollectionAfterChangeHook, CollectionBeforeDeleteHook } from 'payload'

import type { Dispatcher } from '../../../core/index.js'
import {
  dispatchRevalidationChanges,
  isDraftSave,
  listLocales,
  logRevalidateDispatch,
  mediaSubject,
  revalidationLog,
  uniqueLocalesFromChanges,
} from '../lifecycle/helpers.js'
import { resolveMediaAffectedLocales } from './resolve-media-affected-locales.js'
import { resolveMediaDependentChanges } from './resolve-media-dependents.js'

export const createRevalidateMediaDependentsAfterChange = (
  dispatcher: Dispatcher,
  options: {
    pluginExcludeFields?: readonly string[]
    pluginCollectionExcludeFields?: Readonly<Record<string, readonly string[]>>
    mediaPluginExcludeFields?: readonly string[]
  } = {},
): CollectionAfterChangeHook => {
  return async ({ doc, previousDoc, operation, req, collection }) => {
    if (operation !== 'update') return doc

    const mediaId = doc.id
    if (mediaId === undefined || mediaId === null) return doc

    const subject = mediaSubject(mediaId)

    if (isDraftSave(req)) {
      revalidationLog.skip(req.payload.logger, subject, 'autosave')
      return doc
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
      return doc
    }

    const changes = await resolveMediaDependentChanges({
      mediaId,
      mediaSlug: collection.slug,
      payload: req.payload,
      locales: affectedLocales,
      operation: 'update',
    })

    if (!changes.length) {
      revalidationLog.skip(req.payload.logger, subject, 'no references')
      return doc
    }

    const posted = uniqueLocalesFromChanges(changes.map((c) => c.locale))
    logRevalidateDispatch(req.payload.logger, subject, posted)

    await dispatchRevalidationChanges({ req, changes, logger: req.payload.logger, dispatcher })

    return doc
  }
}

export const createRevalidateMediaDependentsBeforeDelete = (
  dispatcher: Dispatcher,
): CollectionBeforeDeleteHook => {
  return async ({ id, req, collection }) => {
    const subject = mediaSubject(id)
    const locales = listLocales(req)
    const changes = await resolveMediaDependentChanges({
      mediaId: id,
      mediaSlug: collection.slug,
      payload: req.payload,
      locales,
      operation: 'update',
    })

    if (!changes.length) {
      revalidationLog.skip(req.payload.logger, subject, 'no references')
      return
    }

    const posted = uniqueLocalesFromChanges(changes.map((c) => c.locale))
    logRevalidateDispatch(req.payload.logger, subject, posted)

    await dispatchRevalidationChanges({ req, changes, logger: req.payload.logger, dispatcher })
  }
}
