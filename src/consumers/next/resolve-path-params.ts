import { assertPathValue } from '../../core/param-values.js'
import type { CacheEntry, CacheMode } from '../../core/types.js'
import { getTagTemplateMeta, type TemplateMetaCarrier } from './compile-tag-template.js'
import type { PathDef, TagParamsBag } from './host-types.js'

const pushRendered = (
  entries: CacheEntry[],
  render: (params: TagParamsBag) => string | null,
  params: TagParamsBag,
  mode: CacheMode,
): void => {
  const value = render(params)
  if (value !== null) {
    entries.push({ value, mode })
  }
}

export const resolvePathEntries = (
  pathDef: PathDef,
  params: TagParamsBag,
  defaultMode: CacheMode,
  ruleMode?: CacheMode,
): CacheEntry[] => {
  const mode = ruleMode ?? defaultMode
  const meta = getTagTemplateMeta(pathDef as TemplateMetaCarrier)
  const render = meta?.render ?? ((p: TagParamsBag) => pathDef(p))

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) assertPathValue(key, value)
  }

  const entries: CacheEntry[] = []
  pushRendered(entries, render, params, mode)
  return entries
}
