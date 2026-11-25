import { CacheConfigurationError } from '../../core/errors.js'
import { expandLowEffortHost } from './expand-low-effort-host.js'
import type {
  BuiltPaths,
  BuiltTags,
  DefineRevalidationInput,
  DefineRevalidationInputFull,
  DefineRevalidationInputRules,
  PathTemplate,
  TagTemplate,
} from './host-types.js'

const hasOwn = <TObject extends object>(obj: TObject, key: string): boolean =>
  Object.hasOwn(obj, key)

const hasRules = <TInput extends object>(input: TInput): boolean => hasOwn(input, 'rules')

export const isLowEffortHostInput = (input: object): boolean =>
  hasRules(input) && !hasOwn(input, 'sources')

export const normalizeHostInput = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TSource extends string,
>(
  input: DefineRevalidationInput<TTags, TPaths, TSource>,
  builtTags: BuiltTags<Record<string, TagTemplate>>,
  builtPaths: BuiltPaths<Record<string, PathTemplate>>,
): DefineRevalidationInputFull<TTags, TPaths, string> => {
  if (hasRules(input) && hasOwn(input, 'sources')) {
    throw new CacheConfigurationError(
      'defineRevalidation: use either rules (simple form) or sources + layers function, not both',
    )
  }

  if (hasRules(input) && hasOwn(input, 'layers')) {
    throw new CacheConfigurationError(
      'defineRevalidation: simple rules use rules.layers for cache layers, not top-level layers',
    )
  }

  if (isLowEffortHostInput(input)) {
    return expandLowEffortHost(
      input as DefineRevalidationInputRules<TTags, TPaths>,
      builtTags,
      builtPaths,
    ) as DefineRevalidationInputFull<TTags, TPaths, string>
  }

  if (!hasOwn(input, 'sources') || !hasOwn(input, 'layers')) {
    throw new CacheConfigurationError(
      'defineRevalidation: sources and layers function are required for the source DSL, or rules for the simple form',
    )
  }

  const fullLayers = (input as DefineRevalidationInputFull<TTags, TPaths, TSource>).layers
  if (typeof fullLayers !== 'function') {
    throw new CacheConfigurationError(
      'defineRevalidation: source DSL requires layers to be a function',
    )
  }

  return input as DefineRevalidationInputFull<TTags, TPaths, string>
}
