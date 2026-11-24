import {
  compileTagTemplate,
  fitTagLength,
  TAG_TEMPLATE_KEYS,
  type TagTemplateMeta,
} from './compile-tag-template.js'
import {
  type BuiltPaths,
  type BuiltTags,
  PATH_SYMBOL,
  type PathTemplate,
  TAG_SYMBOL,
  type TagBuilder,
  type TagParamsBag,
  type TagTemplate,
} from './host-types.js'

const tagParamError = (tagId: string, keys: readonly string[], params: TagParamsBag): string => {
  const missing = keys.filter((k) => !params[k])
  return `Tag "${tagId}" missing param(s): ${missing.join(', ')}`
}

const builderFromTemplate = (tagId: string, template: string, fitTag = false): TagBuilder => {
  const compiled = compileTagTemplate(template)
  const render = fitTag
    ? (params: TagParamsBag) => {
        const value = compiled.render(params)
        return value === null ? null : fitTagLength(value)
      }
    : compiled.render
  const meta = { ...compiled, render }
  const fn = (params: TagParamsBag): string => {
    const value = render(params)
    if (value === null) {
      throw new Error(tagParamError(tagId, compiled.keys, params))
    }
    return value
  }

  Object.defineProperty(fn, TAG_SYMBOL, { value: tagId, enumerable: false })
  Object.defineProperty(fn, TAG_TEMPLATE_KEYS, {
    value: meta satisfies TagTemplateMeta,
    enumerable: false,
  })

  return fn
}

export const buildTagDefs = <T extends Record<string, TagTemplate>>(tags: T): BuiltTags<T> => {
  const out = {} as BuiltTags<T>
  for (const [id, template] of Object.entries(tags)) {
    out[id as keyof T] = builderFromTemplate(id, template, true) as BuiltTags<T>[keyof T]
  }
  return out
}

export const buildPathDefs = <T extends Record<string, PathTemplate>>(paths: T): BuiltPaths<T> => {
  const out = {} as BuiltPaths<T>
  for (const [id, template] of Object.entries(paths)) {
    const fn = builderFromTemplate(id, template)
    Object.defineProperty(fn, PATH_SYMBOL, { value: id, enumerable: false })
    out[id as keyof T] = fn as BuiltPaths<T>[keyof T]
  }
  return out
}
