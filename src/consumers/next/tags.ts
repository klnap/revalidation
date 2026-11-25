import type { BuiltPaths, BuiltTags, PathTemplate, TagTemplate } from './host-types.js'
import { buildPathDefs, buildTagDefs } from './registry-builders.js'

export type DefinedRevalidationTags<
  TTags extends Record<string, TagTemplate> = Record<never, never>,
  TPaths extends Record<string, PathTemplate> = Record<never, never>,
> = {
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
}

export type DefineRevalidationTagsInput<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
> = { tags: TTags; paths?: TPaths } | { tags?: TTags; paths: TPaths }

export function defineRevalidationTags<
  const TTags extends Record<string, TagTemplate> = Record<never, never>,
  const TPaths extends Record<string, PathTemplate> = Record<never, never>,
>(input: DefineRevalidationTagsInput<TTags, TPaths>): DefinedRevalidationTags<TTags, TPaths> {
  if (!input.tags && !input.paths) {
    throw new Error('defineRevalidationTags: provide tags or paths')
  }

  return {
    tags: buildTagDefs((input.tags ?? {}) as TTags),
    paths: buildPathDefs((input.paths ?? {}) as TPaths),
  }
}
