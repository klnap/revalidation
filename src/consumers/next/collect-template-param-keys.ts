import { getTagTemplateMeta, type TemplateMetaCarrier } from './compile-tag-template.js'
import type { BuiltPaths, BuiltTags, PathTemplate, TagTemplate } from './host-types.js'

export const collectTemplateParamKeys = (
  tags: BuiltTags<Record<string, TagTemplate>>,
  paths: BuiltPaths<Record<string, PathTemplate>>,
): readonly string[] => {
  const seen = new Set<string>()

  const addFromBuilder = (builder: Parameters<typeof getTagTemplateMeta>[0]) => {
    const meta = getTagTemplateMeta(builder)
    if (!meta) return
    for (const key of meta.keys) {
      seen.add(key)
    }
  }

  for (const tag of Object.values(tags)) {
    addFromBuilder(tag as TemplateMetaCarrier)
  }
  for (const path of Object.values(paths)) {
    addFromBuilder(path as TemplateMetaCarrier)
  }

  return [...seen]
}
