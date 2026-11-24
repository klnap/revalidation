import { CacheConfigurationError } from '../../core/errors.js'
import { expandLowEffortHost } from './expand-low-effort-host.js'
import type {
  DefineRevalidationInput,
  DefineRevalidationInputFull,
  DefineRevalidationInputLowEffort,
  PathTemplate,
  TagTemplate,
} from './host-types.js'

const hasOwn = <TObject extends object>(obj: TObject, key: string): boolean =>
  Object.hasOwn(obj, key)

const hasLowEffortInvalidate = <TInput extends object>(input: TInput): boolean =>
  hasOwn(input, 'invalidate')

export const isLowEffortHostInput = (input: object): boolean =>
  hasLowEffortInvalidate(input) && !hasOwn(input, 'sources')

export const normalizeHostInput = <
  TTags extends Record<string, TagTemplate>,
  TPaths extends Record<string, PathTemplate>,
  TSource extends string,
>(
  input: DefineRevalidationInput<TTags, TPaths, TSource>,
): DefineRevalidationInputFull<TTags, TPaths, string> => {
  if (hasLowEffortInvalidate(input) && hasOwn(input, 'sources')) {
    throw new CacheConfigurationError(
      'defineRevalidation: use either invalidate (low-effort) or sources + layers function, not both',
    )
  }

  if (hasLowEffortInvalidate(input) && hasOwn(input, 'layers')) {
    throw new CacheConfigurationError(
      'defineRevalidation: low-effort uses invalidate only — not top-level layers (use invalidate.layers for next / CDN)',
    )
  }

  if (isLowEffortHostInput(input)) {
    return expandLowEffortHost(
      input as DefineRevalidationInputLowEffort<TTags, TPaths | undefined>,
    ) as DefineRevalidationInputFull<TTags, TPaths, string>
  }

  if (!hasOwn(input, 'sources') || !hasOwn(input, 'layers')) {
    throw new CacheConfigurationError(
      'defineRevalidation: sources and layers function are required for full DSL, or invalidate for low-effort',
    )
  }

  const fullLayers = (input as DefineRevalidationInputFull<TTags, TPaths, TSource>).layers
  if (typeof fullLayers !== 'function') {
    throw new CacheConfigurationError(
      'defineRevalidation: full DSL requires layers to be a function; low-effort uses invalidate',
    )
  }

  return input as DefineRevalidationInputFull<TTags, TPaths, string>
}
