import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

import type { Dispatcher } from '../../../core/index.js'
import { pathValueProblem } from '../../../core/param-values.js'
import { resolveExcludeFields } from '../exclude-fields.js'
import { isLocaleRestoreReq } from '../publish-all/restore-guard.js'
import {
  normalizeCollectionRevalidation,
  type RevalidationIdentifierField,
  readRevalidationCustom,
} from '../revalidation-custom.js'
import {
  dispatchRevalidationChanges,
  isRevalidationAllLocales,
  isRevalidationOrderOnly,
} from './deferred.js'
import {
  getOperation,
  getRequestLocale,
  hasLocaleData,
  hasLocalizedDraftStatus,
  isDraftSave,
  isLocalePublished,
  isPublishAllLocales,
  listLocales,
  resolveChangedLocales,
  shouldSkipDraftRevalidation,
  shouldSkipUnchangedLocale,
  shouldSkipUnpublishedLocaleDoc,
  toTypedLocale,
} from './helpers.js'
import { listPublishedLocalesForDocument, uniqueLocales } from './identifier-field.js'
import { definedIdentifiers, identifierChanged, readIdentifierValues } from './identifiers.js'
import { resolveDefaultLocaleCode } from './locale.js'
import {
  collectionDocId,
  describeLocaleSkip,
  formatLogDetail,
  logRevalidateDispatch,
  revalidationLog,
  revalidationLogError,
  revalidationSubject,
} from './log.js'
import { resolveOrderableNeighborChanges } from './orderable-neighbors.js'
import { draftVersionsEnabled } from './skip-rules.js'
import type { RevalidateArgs, RevalidationChange } from './types.js'

export type RevalidationHookOptions = {
  pluginExcludeFields?: readonly string[]
  pluginCollectionExcludeFields?: Readonly<Record<string, readonly string[]>>
  pluginGlobalExcludeFields?: Readonly<Record<string, readonly string[]>>
}

const schemaCustomForArgs = (args: RevalidateArgs): unknown =>
  'collection' in args ? args.collection.custom : args.global.custom

const readIdentifiersForArgs = (args: RevalidateArgs): RevalidationIdentifierField[] => {
  if (!('collection' in args)) return []
  const meta = readRevalidationCustom(args.collection.custom)
  if (!meta) return []
  return normalizeCollectionRevalidation(meta).identifiers
}

type VersionRow = {
  updatedAt?: string
  snapshot?: boolean
  autosave?: boolean
  version?: Record<string, unknown>
}

/** publish-all writes one version per locale within seconds — skip that cluster. */
const BATCH_WINDOW_MS = 60_000

const fetchLocaleDoc = async ({
  args,
  locale,
}: {
  args: RevalidateArgs
  locale: string
}): Promise<Record<string, unknown>> => {
  const { req, doc } = args

  if ('collection' in args) {
    return (await req.payload.findByID({
      collection: args.collection.slug,
      id: doc.id,
      locale: toTypedLocale(locale),
      fallbackLocale: false,
      depth: 0,
      draft: false,
      overrideAccess: true,
      // Inside the save transaction: a freshly created row is invisible to a separate connection.
      req,
    })) as Record<string, unknown>
  }

  return (await req.payload.findGlobal({
    slug: args.global.slug,
    locale: toTypedLocale(locale),
    fallbackLocale: false,
    depth: 0,
    draft: false,
    overrideAccess: true,
    req,
  })) as Record<string, unknown>
}

const versionTime = (row: VersionRow | undefined): number => {
  if (!row?.updatedAt) return 0
  const t = new Date(row.updatedAt).getTime()
  return Number.isNaN(t) ? 0 : t
}

const isPublishedRow = (row: VersionRow, locale: string): boolean => {
  if (row.snapshot || row.autosave) return false
  const status = row.version?._status
  if (status === 'draft') return false
  if (status === 'published') return true
  if (status && typeof status === 'object') {
    return (status as Record<string, unknown>)[locale] === 'published'
  }
  return Boolean(row.version)
}

const fetchPreviousLocaleDoc = async ({
  args,
  locale,
}: {
  args: RevalidateArgs
  locale: string
}): Promise<Record<string, unknown> | undefined> => {
  const { req, doc } = args
  const typedLocale = toTypedLocale(locale)

  const schema = 'collection' in args ? args.collection : args.global
  if (!draftVersionsEnabled(schema)) return undefined

  let page = 1
  let latest: VersionRow | undefined
  const publishAllLocales = isPublishAllLocales(req)

  for (;;) {
    const result =
      'collection' in args
        ? await req.payload.findVersions({
            collection: args.collection.slug,
            where: { parent: { equals: doc.id } },
            locale: typedLocale,
            limit: 30,
            page,
            sort: '-updatedAt',
            depth: 0,
            overrideAccess: true,
            req,
          })
        : await req.payload.findGlobalVersions({
            slug: args.global.slug,
            locale: typedLocale,
            limit: 30,
            page,
            sort: '-updatedAt',
            depth: 0,
            overrideAccess: true,
            req,
          })

    for (const row of result.docs as VersionRow[]) {
      if (!isPublishedRow(row, locale)) continue
      if (!latest) {
        latest = row
        continue
      }
      if (!publishAllLocales) return row.version
      if (versionTime(row) < versionTime(latest) - BATCH_WINDOW_MS) return row.version
    }

    if (!result.hasNextPage) return undefined
    page += 1
  }
}

export const readCollectionRouteSlug = (
  args: RevalidateArgs,
  locale: string,
  doc: Record<string, unknown>,
): string | undefined => {
  if (!('collection' in args)) return undefined

  const meta = readRevalidationCustom(args.collection.custom)
  const identifiers = meta ? normalizeCollectionRevalidation(meta).identifiers : []

  if (identifiers.length > 0) {
    // The first configured identifier is the route key; the others are reported on the change.
    return readIdentifierValues({
      collection: args.collection,
      paths: identifiers,
      doc,
      locale,
    })[identifiers[0] as string]
  }

  const slug = doc.slug
  if (typeof slug !== 'string' || slug.length === 0) return undefined
  const problem = pathValueProblem(slug)
  if (problem) {
    // The event carries no slug for this document; the reason is logged, not silently dropped.
    revalidationLog.warn(
      args.req.payload.logger,
      revalidationSubject(args),
      formatLogDetail({
        docId: collectionDocId(args),
        reason: `slug omitted: ${problem}`,
      }),
    )
    return undefined
  }
  return slug
}

/** Every configured identifier value of the document in this locale (absent when none configured). */
const readChangeIdentifiers = (
  args: RevalidateArgs,
  locale: string,
  doc: Record<string, unknown>,
): Record<string, string> | undefined => {
  if (!('collection' in args)) return undefined
  const meta = readRevalidationCustom(args.collection.custom)
  const identifiers = meta ? normalizeCollectionRevalidation(meta).identifiers : []
  if (identifiers.length === 0) return undefined
  return definedIdentifiers(
    readIdentifierValues({ collection: args.collection, paths: identifiers, doc, locale }),
  )
}

type RevalidationLocaleScope = {
  locales: string[]
  /** Slug/identifier changed in one locale — refresh every published locale (e.g. language switcher slugs). */
  identifierChangedOnDocument: boolean
}

const resolveRevalidationLocaleScope = async (
  args: RevalidateArgs,
): Promise<RevalidationLocaleScope> => {
  const { req, doc } = args
  const operation = getOperation(args)
  const locales = resolveChangedLocales({
    args,
    locales: listLocales(req),
  })

  if (operation === 'delete' || !('collection' in args)) {
    return { locales, identifierChangedOnDocument: false }
  }

  const meta = readRevalidationCustom(args.collection.custom)
  if (!meta) return { locales, identifierChangedOnDocument: false }

  const { identifiers } = normalizeCollectionRevalidation(meta)
  if (identifiers.length === 0) return { locales, identifierChangedOnDocument: false }

  let anyIdentifierChanged = false

  for (const locale of locales) {
    let currentDoc: Record<string, unknown>
    try {
      currentDoc = await fetchLocaleDoc({ args, locale })
    } catch {
      continue
    }
    const previousDoc = await fetchPreviousLocaleDoc({ args, locale })
    if (!previousDoc) continue

    const current = readIdentifierValues({
      collection: args.collection,
      paths: identifiers,
      doc: currentDoc,
      locale,
    })
    const previous = readIdentifierValues({
      collection: args.collection,
      paths: identifiers,
      doc: previousDoc,
      locale,
    })
    if (identifierChanged(identifiers, current, previous)) {
      anyIdentifierChanged = true
      break
    }
  }

  if (!anyIdentifierChanged) {
    return { locales, identifierChangedOnDocument: false }
  }

  const published = listPublishedLocalesForDocument({
    req,
    collection: args.collection,
    doc: doc as Record<string, unknown>,
  })

  return {
    locales: uniqueLocales([...locales, ...published]),
    identifierChangedOnDocument: true,
  }
}

export const runRevalidationHook = async (
  args: RevalidateArgs,
  dispatcher: Dispatcher,
  options: RevalidationHookOptions = {},
): Promise<void> => {
  const { req, doc } = args
  const operation = getOperation(args)
  const logger = req.payload.logger

  if (isLocaleRestoreReq(req)) {
    return
  }

  const subject = revalidationSubject(args)
  const docId = collectionDocId(args)

  if (isDraftSave(req)) {
    revalidationLog.skip(logger, subject, formatLogDetail({ docId, reason: 'autosave' }))
    return
  }

  if (shouldSkipDraftRevalidation(args)) {
    revalidationLog.skip(logger, subject, formatLogDetail({ docId, reason: 'draft' }))
    return
  }

  const type = 'collection' in args ? 'collection' : 'global'
  const slug = 'collection' in args ? args.collection.slug : args.global.slug

  const { locales, identifierChangedOnDocument } = await resolveRevalidationLocaleScope(args)

  if (!locales.length) {
    revalidationLog.skip(logger, subject, formatLogDetail({ docId, reason: 'unchanged' }))
    return
  }

  const hookPrevious =
    'previousDoc' in args && args.previousDoc
      ? (args.previousDoc as Record<string, unknown>)
      : undefined
  const orderSettings = readRevalidationCustom(schemaCustomForArgs(args))
  const orderField =
    (orderSettings && orderSettings !== true ? orderSettings.orderField : undefined) ?? '_order'

  const changes: RevalidationChange[] = []
  const skipped: string[] = []
  // Payload may leave `req.locale` on the last locale it iterated while publishing. A global write
  // (reorder) has no edited locale, so every locale is read from the database instead of the hook doc.
  const editedLocale = isRevalidationAllLocales(args.req)
    ? undefined
    : (getRequestLocale(args.req) ??
      (!args.req.payload.config.localization ? resolveDefaultLocaleCode(args.req) : undefined))

  for (const locale of locales) {
    let localeDoc: Record<string, unknown>
    let localePreviousDoc: Record<string, unknown> | undefined

    if (operation === 'delete') {
      localeDoc = doc
      localePreviousDoc = hookPrevious
    } else {
      try {
        localeDoc = await fetchLocaleDoc({ args, locale })
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'status' in err
            ? (err as { status?: number }).status
            : undefined
        if (status === 404) {
          skipped.push(`${locale}:missing`)
          continue
        }
        throw err
      }
      if (!hasLocaleData(localeDoc)) {
        skipped.push(`${locale}:empty`)
        continue
      }

      if (editedLocale === locale) {
        localeDoc = doc as Record<string, unknown>
      }

      localePreviousDoc = await fetchPreviousLocaleDoc({ args, locale })
      if (editedLocale === locale && hookPrevious) {
        localePreviousDoc = hookPrevious
      }
    }

    const pushChange = (
      docForChange: Record<string, unknown>,
      previousOrder?: RevalidationChange['previousOrder'],
    ) => {
      const identifiers = readChangeIdentifiers(args, locale, docForChange)
      changes.push({
        type,
        slug,
        operation,
        locale,
        doc: docForChange,
        routeSlug: readCollectionRouteSlug(args, locale, docForChange),
        ...(identifiers ? { identifiers } : {}),
        ...(previousOrder ? { previousOrder } : {}),
      })
    }
    // Previous state of this document in this locale. The order key comes from the hook's previous
    // document (non-localized); visibility and slug need the locale's previous version.
    const previousOrderFor = (): RevalidationChange['previousOrder'] => {
      if (!('collection' in args)) return undefined
      const key =
        (orderField === '_order' || editedLocale === locale
          ? hookPrevious?.[orderField]
          : undefined) ?? localePreviousDoc?.[orderField]
      if (typeof key !== 'string' || key.length === 0) return undefined
      const schema = args.collection
      return {
        key,
        ...(localePreviousDoc
          ? {
              visible:
                !draftVersionsEnabled(schema) ||
                isLocalePublished(
                  localePreviousDoc._status,
                  locale,
                  hasLocalizedDraftStatus(schema),
                ),
              routeSlug: readCollectionRouteSlug(args, locale, localePreviousDoc),
            }
          : {}),
        orderOnly: isRevalidationOrderOnly(args.req),
      }
    }

    if (
      shouldSkipUnpublishedLocaleDoc({
        args,
        locale,
        localeDoc,
        operation,
      })
    ) {
      const schema = 'collection' in args ? args.collection : args.global
      const localizeStatus = hasLocalizedDraftStatus(schema)
      // This locale's own status. The hook document belongs to the edited locale only: reading its
      // status here would publish another locale's content under this locale's slug.
      if (!isLocalePublished(localeDoc._status, locale, localizeStatus)) {
        if (
          localePreviousDoc &&
          isLocalePublished(localePreviousDoc._status, locale, localizeStatus)
        ) {
          pushChange(localePreviousDoc)
          continue
        }
        skipped.push(`${locale}:draft`)
        continue
      }
    }

    if (operation === 'delete' || !localePreviousDoc) {
      pushChange(localeDoc, previousOrderFor())
      continue
    }

    const identifiers = readIdentifiersForArgs(args)
    const excludeFields = resolveExcludeFields({
      schemaCustom: schemaCustomForArgs(args),
      pluginExcludeFields: options.pluginExcludeFields,
      pluginCollectionExcludeFields: options.pluginCollectionExcludeFields,
      pluginGlobalExcludeFields: options.pluginGlobalExcludeFields,
      collectionSlug: 'collection' in args ? args.collection.slug : undefined,
      globalSlug: 'global' in args ? args.global.slug : undefined,
      identifiers,
    })

    if (identifiers.length > 0 && 'collection' in args) {
      const current = readIdentifierValues({
        collection: args.collection,
        paths: identifiers,
        doc: localeDoc,
        locale,
      })
      const previous = readIdentifierValues({
        collection: args.collection,
        paths: identifiers,
        doc: localePreviousDoc,
        locale,
      })
      if (identifierChanged(identifiers, current, previous)) {
        // Old values (previous doc) and new values (current doc) both reach the receiver.
        pushChange(localePreviousDoc)
        pushChange(localeDoc, previousOrderFor())
        continue
      }
    }

    if (
      !isPublishAllLocales(args.req) &&
      shouldSkipUnchangedLocale({
        current: localeDoc,
        previous: localePreviousDoc,
        operation,
        excludeFields,
      })
    ) {
      if (identifierChangedOnDocument) {
        pushChange(localeDoc, previousOrderFor())
        continue
      }
      skipped.push(`${locale}:unchanged`)
      continue
    }

    pushChange(localeDoc, previousOrderFor())
  }

  if (
    changes.length &&
    'collection' in args &&
    (args.collection.orderable || orderField !== '_order')
  ) {
    const collectionSlug = args.collection.slug
    changes.push(
      ...(await resolveOrderableNeighborChanges({
        req,
        collectionSlug,
        changes,
        orderField,
        draftsEnabled: draftVersionsEnabled(args.collection),
        previousOrderKey: orderField === '_order' ? hookPrevious?.[orderField] : undefined,
        toChange: (neighbor, locale) => ({
          type,
          slug: collectionSlug,
          operation: 'update',
          locale,
          doc: neighbor,
          routeSlug: readCollectionRouteSlug(args, locale, neighbor),
          // Same identity shape as every other change of this collection (keeps the batch deduplicated).
          ...(readChangeIdentifiers(args, locale, neighbor)
            ? { identifiers: readChangeIdentifiers(args, locale, neighbor) }
            : {}),
        }),
      })),
    )
  }

  const posted = changes.map((c) => c.locale)

  if (!changes.length) {
    revalidationLog.skip(
      logger,
      subject,
      skipped.length
        ? formatLogDetail({
            docId,
            reason: skipped.map(describeLocaleSkip).join(', '),
          })
        : formatLogDetail({ docId, reason: 'unchanged' }),
    )
    return
  }

  logRevalidateDispatch(logger, subject, posted, skipped, docId)

  await dispatchRevalidationChanges({ req, changes, logger, dispatcher })
}

/**
 * Fail-open: a read error while building the event (for example a failing `findByID`) is logged and
 * does not reject the Payload save. The affected revalidation is lost; see docs/reliability.md.
 */
export const runRevalidationHookFailOpen = async (
  args: RevalidateArgs,
  dispatcher: Dispatcher,
  options: RevalidationHookOptions = {},
): Promise<void> => {
  try {
    await runRevalidationHook(args, dispatcher, options)
  } catch (error) {
    revalidationLogError(
      args.req.payload.logger,
      error instanceof Error ? error.message : String(error),
      'build',
    )
  }
}

export const createCollectionRevalidateAfterChange = (
  dispatcher: Dispatcher,
  options: RevalidationHookOptions = {},
): CollectionAfterChangeHook => {
  return async (args) => {
    await runRevalidationHookFailOpen(args, dispatcher, options)
    return args.doc
  }
}

export const createCollectionRevalidateAfterDelete = (
  dispatcher: Dispatcher,
  options: RevalidationHookOptions = {},
): CollectionAfterDeleteHook => {
  return async (args) => {
    await runRevalidationHookFailOpen(args, dispatcher, options)
  }
}

export const createGlobalRevalidateAfterChange = (
  dispatcher: Dispatcher,
  options: RevalidationHookOptions = {},
): GlobalAfterChangeHook => {
  return async (args) => {
    await runRevalidationHookFailOpen(args, dispatcher, options)
    return args.doc
  }
}
