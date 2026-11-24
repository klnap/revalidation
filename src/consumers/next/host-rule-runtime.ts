import type { CacheMode } from '../../core/types.js'
import type { CompiledLayerRule } from './compiled-host-types.js'
import type {
  BuiltPaths,
  BuiltTags,
  LayerPrepare,
  LayerRuleEvent,
  PathTemplate,
  TagParamsBag,
  TagTemplate,
} from './host-types.js'
import { resolvePathEntries } from './resolve-path-params.js'
import { resolveTagEntries } from './resolve-tag-params.js'

export const mergeItem = <T extends Record<string, unknown>>(
  item: T,
  partial: Partial<T> | void,
): T => {
  if (!partial || typeof partial !== 'object') return item
  return { ...item, ...partial }
}

export const runRulePrepare = async (
  prepare: LayerPrepare | undefined,
  source: string,
  event: LayerRuleEvent,
): Promise<LayerRuleEvent> => {
  if (!prepare) return event

  let partial: unknown
  if (typeof prepare === 'function') {
    partial = await prepare(event)
  } else {
    const fn = prepare[source]
    if (!fn) return event
    partial = await fn(event)
  }

  return {
    ...event,
    item: mergeItem(event.item as Record<string, unknown>, partial as Record<string, unknown>),
  }
}

export const collectTagsForRule = (
  rule: CompiledLayerRule,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  params: TagParamsBag,
  defaultMode: CacheMode,
  onSkip?: (id: string) => void,
): ReturnType<typeof resolveTagEntries> => {
  const entries: ReturnType<typeof resolveTagEntries> = []
  for (const tagId of rule.tagIds) {
    const tagDef = builtTags[tagId as keyof BuiltTags]
    if (!tagDef) continue
    entries.push(
      ...resolveTagEntries(tagDef, params, defaultMode, rule.mode, () => onSkip?.(tagId)),
    )
  }
  return entries
}

export const collectPathsForRule = (
  rule: CompiledLayerRule,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
  params: TagParamsBag,
  defaultMode: CacheMode,
  onSkip?: (id: string) => void,
): ReturnType<typeof resolvePathEntries> => {
  const entries: ReturnType<typeof resolvePathEntries> = []
  for (const pathId of rule.pathIds) {
    const pathDef = builtPaths[pathId as keyof BuiltPaths]
    if (!pathDef) continue
    entries.push(
      ...resolvePathEntries(pathDef, params, defaultMode, rule.mode, () => onSkip?.(pathId)),
    )
  }
  return entries
}
