import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

export type RevalidationChange = {
  type: 'collection' | 'global'
  slug: string
  operation: 'create' | 'update' | 'delete'
  locale: string
  doc: Record<string, unknown>
  /** Route segment for cache tag templates (`[slug]`), from identifier path when configured. */
  routeSlug?: string
  /** Every configured identifier value in this locale, keyed by field path (absent when none configured). */
  identifiers?: Record<string, string>
  /**
   * The same document in this locale before the save: its order key and whether it was published.
   * Present for updates where the previous version is known; enables an exact neighbour diff.
   */
  previousOrder?: {
    key: string
    /** Whether the locale was published before. Undefined when the previous version was not found. */
    visible?: boolean
    routeSlug?: string
    /** The write changed only `_order`: publication and content are unchanged. */
    orderOnly?: boolean
  }
}

export type RevalidateArgs =
  | Parameters<CollectionAfterChangeHook>[0]
  | Parameters<CollectionAfterDeleteHook>[0]
  | Parameters<GlobalAfterChangeHook>[0]
