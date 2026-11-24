import { compileHostRevalidation } from './compile-revalidation-host.js'
import type { NextRevalidationHandlerConfig } from './handler-config.js'
import type {
  BuiltPaths,
  BuiltTags,
  DefineRevalidationInput,
  PathTemplate,
  TagTemplate,
} from './host-types.js'

/** Input accepted by `defineRevalidationTags`: the `defineRevalidation` input without `secret`. */
export type DefineRevalidationTagsInput<
  TTags extends Record<string, TagTemplate> = Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> = Record<string, PathTemplate>,
  TSource extends string = string,
> =
  DefineRevalidationInput<TTags, TPaths, TSource> extends infer T
    ? T extends { secret: string }
      ? Omit<T, 'secret'>
      : never
    : never

let registered: NextRevalidationHandlerConfig | null = null
let registeredTags: BuiltTags<Record<string, TagTemplate>> | null = null
let registeredPaths: BuiltPaths<Record<string, PathTemplate>> | null = null

export type DefinedRevalidation<
  TTags extends Record<string, TagTemplate> = Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> = Record<string, PathTemplate>,
> = {
  tags: BuiltTags<TTags>
  paths: BuiltPaths<TPaths>
}

/**
 * Builds tag and path helpers without registering a handler config or requiring a secret.
 * Use this where only `tags`/`paths` are needed at import or render time; the POST handler
 * still requires `defineRevalidation` with the real secret, read at request time.
 */
export function defineRevalidationTags<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> = Record<string, PathTemplate>,
  TSource extends string = string,
>(
  input: DefineRevalidationTagsInput<TTags, TPaths, TSource> & { tags: TTags },
): DefinedRevalidation<TTags, TPaths> {
  // The placeholder secret only feeds the discarded compiled config; nothing is registered.
  const compiled = compileHostRevalidation({
    ...input,
    secret: '',
  } as DefineRevalidationInput<TTags, TPaths, TSource> & { tags: TTags })
  return {
    tags: compiled.tags as BuiltTags<TTags>,
    paths: compiled.paths as BuiltPaths<TPaths>,
  }
}

export function defineRevalidation<
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate> = Record<string, PathTemplate>,
  TSource extends string = string,
>(
  input: DefineRevalidationInput<TTags, TPaths, TSource> & { tags: TTags },
): DefinedRevalidation<TTags, TPaths> {
  if (!input.secret) {
    throw new Error('defineRevalidation: secret is required')
  }

  const compiled = compileHostRevalidation(input)
  const { config } = compiled
  const tags = compiled.tags as BuiltTags<TTags>
  const paths = compiled.paths as BuiltPaths<TPaths>

  if (registered) {
    if (registered.secret !== config.secret) {
      throw new Error('defineRevalidation: already called in this process with a different secret')
    }
    if (process.env.NODE_ENV === 'production') {
      return {
        tags: registeredTags as BuiltTags<TTags>,
        paths: registeredPaths as BuiltPaths<TPaths>,
      }
    }
  }

  registered = config
  registeredTags = tags as BuiltTags<Record<string, TagTemplate>>
  registeredPaths = paths as BuiltPaths<Record<string, PathTemplate>>
  return { tags, paths }
}

export function getDefinedRevalidation(): NextRevalidationHandlerConfig {
  if (!registered) {
    throw new Error('defineRevalidation must be called before the revalidation consumer POST route')
  }
  return registered
}

export function getRevalidation(): DefinedRevalidation {
  if (!registeredTags || !registeredPaths) {
    throw new Error('defineRevalidation must be called before getRevalidation')
  }
  return { tags: registeredTags, paths: registeredPaths }
}

/** Test helper — clears module registry. */
export function resetDefinedRevalidation(): void {
  registered = null
  registeredTags = null
  registeredPaths = null
}
