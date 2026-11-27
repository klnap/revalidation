export const TAG_SYMBOL: unique symbol = Symbol.for('@klnap/revalidation/tag')
export const PATH_SYMBOL: unique symbol = Symbol.for('@klnap/revalidation/path')

/** Params for `tags.*({ … })` and POST revalidation (any `[key]` in templates). */
export type TagParamsBag = Record<string, string | undefined>

export type TagTemplate = string
export type PathTemplate = string

export type TagBuilder = (params: TagParamsBag) => string

type TemplateParamNames<T extends string> = T extends `${string}[${infer Key}]${infer Rest}`
  ? Key | TemplateParamNames<Rest>
  : never

type TemplateBuilder<T extends string> = string extends T
  ? TagBuilder
  : [TemplateParamNames<T>] extends [never]
    ? () => string
    : (params: { [K in TemplateParamNames<T>]: string }) => string

export type TagDef<
  TId extends string = string,
  TTemplate extends string = string,
> = TemplateBuilder<TTemplate> & {
  readonly [TAG_SYMBOL]: TId
}

export type PathDef<
  TId extends string = string,
  TTemplate extends string = string,
> = TemplateBuilder<TTemplate> & {
  readonly [PATH_SYMBOL]: TId
}

export type TagReference<TId extends string = string> = { readonly [TAG_SYMBOL]: TId }
export type PathReference<TId extends string = string> = { readonly [PATH_SYMBOL]: TId }

export type BuiltTags<T extends Record<string, TagTemplate> = Record<string, TagTemplate>> = {
  [K in keyof T]-?: TagDef<K & string, T[K]>
}

export type BuiltPaths<T extends Record<string, PathTemplate> = Record<string, PathTemplate>> = {
  [K in keyof T]-?: PathDef<K & string, T[K]>
}
