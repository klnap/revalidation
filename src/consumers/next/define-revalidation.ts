import { compileHostRevalidation } from './compile-revalidation-host.js'
import { createPostHandler } from './create-cache.js'
import type {
  BuiltPaths,
  BuiltTags,
  DefineRevalidationInput,
  PathTemplate,
  TagTemplate,
} from './host-types.js'

export type DefinedRevalidation<
  TTags extends Record<string, TagTemplate> = Record<never, never>,
  TPaths extends Record<string, PathTemplate> = Record<never, never>,
> = {
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
  POST: (request: Request) => Promise<Response>
}

export function defineRevalidation<
  const TTags extends Record<string, TagTemplate> = Record<never, never>,
  const TPaths extends Record<string, PathTemplate> = Record<never, never>,
  TSource extends string = string,
>(input: DefineRevalidationInput<TTags, TPaths, TSource>): DefinedRevalidation<TTags, TPaths> {
  if (!input.secret) {
    throw new Error('defineRevalidation: secret is required')
  }

  const compiled = compileHostRevalidation(input)
  return {
    tags: compiled.tags,
    paths: compiled.paths,
    POST: createPostHandler(compiled.config),
  }
}
