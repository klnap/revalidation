import type { TagParamsBag } from './host-types.js'

export const TAG_TEMPLATE_KEYS: unique symbol = Symbol.for('@klnap/revalidation/tagTemplateKeys')
export const MAX_TAG_LENGTH = 256

const hashTag = (value: string): string => {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

/** Keeps long tags stable and within Next.js's limit without dropping cache dependencies. */
export const fitTagLength = (value: string): string => {
  if (value.length <= MAX_TAG_LENGTH) return value

  const suffix = `:${hashTag(value)}`
  let prefix = ''
  for (const character of value) {
    if (prefix.length + character.length > MAX_TAG_LENGTH - suffix.length) break
    prefix += character
  }
  return `${prefix}${suffix}`
}

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

type TemplatePart = { kind: 'literal'; value: string } | { kind: 'key'; value: string }

export type CompiledTagTemplate = {
  keys: readonly string[]
  usesSlug: boolean
  render: (params: TagParamsBag) => string | null
}

const parseTemplate = (template: string): TemplatePart[] => {
  const parts: TemplatePart[] = []
  let i = 0
  let literalStart = 0

  while (i < template.length) {
    if (template[i] !== '[') {
      i += 1
      continue
    }

    if (i > literalStart) {
      parts.push({ kind: 'literal', value: template.slice(literalStart, i) })
    }

    const close = template.indexOf(']', i + 1)
    if (close === -1) {
      throw new Error(`Tag template: unclosed "[" in "${template}"`)
    }

    const key = template.slice(i + 1, close)
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Tag template: invalid placeholder [${key}] in "${template}"`)
    }

    parts.push({ kind: 'key', value: key })
    i = close + 1
    literalStart = i
  }

  if (literalStart < template.length) {
    parts.push({ kind: 'literal', value: template.slice(literalStart) })
  }

  return parts
}

export const compileTagTemplate = (template: string): CompiledTagTemplate => {
  const parts = parseTemplate(template)
  const keys: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    if (part.kind !== 'key') continue
    if (!seen.has(part.value)) {
      seen.add(part.value)
      keys.push(part.value)
    }
  }

  const usesSlug = seen.has('slug')

  const render = (params: TagParamsBag): string | null => {
    let out = ''
    for (const part of parts) {
      if (part.kind === 'literal') {
        out += part.value
        continue
      }
      const value = Object.hasOwn(params, part.value) ? params[part.value] : undefined
      if (value === undefined || value === null || value === '') return null
      out += value
    }
    return out
  }

  return { keys, usesSlug, render }
}

export type TagTemplateMeta = CompiledTagTemplate

export type TemplateMetaCarrier = {
  [TAG_TEMPLATE_KEYS]?: TagTemplateMeta
}

export const getTagTemplateMeta = (builder: TemplateMetaCarrier): TagTemplateMeta | undefined =>
  builder[TAG_TEMPLATE_KEYS]
