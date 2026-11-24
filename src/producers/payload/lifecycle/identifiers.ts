import type { CollectionConfig } from 'payload'
import type { RevalidationIdentifierField } from '../revalidation-custom.js'
import { isIdentifierPathLocalized, readIdentifierAtPath } from './identifier-field.js'

/** Identifier values of one document in one locale, keyed by configured field path. */
export type IdentifierValues = Record<RevalidationIdentifierField, string | undefined>

/**
 * Reads every configured identifier field for one locale. Values are not combined: each path is
 * independent. Localized fields are read at `locale`.
 */
export const readIdentifierValues = ({
  collection,
  paths,
  doc,
  locale,
}: {
  collection: CollectionConfig
  paths: readonly RevalidationIdentifierField[]
  doc: Record<string, unknown>
  locale: string
}): IdentifierValues => {
  const values: IdentifierValues = {}
  for (const path of paths) {
    values[path] = readIdentifierAtPath(
      doc,
      path,
      locale,
      isIdentifierPathLocalized(collection, path),
    )
  }
  return values
}

/**
 * A previous identifier changed when its value is present before and differs now, including when the
 * value is gone from the current document. Absent before → nothing to invalidate for that path.
 */
export const identifierChanged = (
  paths: readonly RevalidationIdentifierField[],
  current: IdentifierValues,
  previous: IdentifierValues,
): boolean =>
  paths.some((path) => {
    const before = previous[path]
    return before !== undefined && before !== current[path]
  })

/** Only defined values, so the payload carries no `undefined` entries. */
export const definedIdentifiers = (values: IdentifierValues): Record<string, string> =>
  Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
