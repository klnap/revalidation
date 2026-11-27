import { CacheSchemaError } from '../../core/errors.js'
import { urlSegmentProblem } from '../../core/url-segment.js'

/** Longest value a slug-derived parameter may carry. */
export const MAX_PARAM_LENGTH = 256

/** Why a tag value is unusable, or `undefined` when it is fine. */
export const tagValueProblem = (value: string): string | undefined =>
  value.length > MAX_PARAM_LENGTH ? `longer than ${MAX_PARAM_LENGTH} characters` : undefined

/** Path values become URL segments: no dot segments, separators or control characters. */
export const pathValueProblem = (value: string): string | undefined => {
  const tooLong = tagValueProblem(value)
  if (tooLong) return tooLong
  return urlSegmentProblem(value)
}

export const assertTagValue = (key: string, value: string): void => {
  const problem = tagValueProblem(value)
  if (problem) throw new CacheSchemaError(`Parameter "${key}" is ${problem}`)
}

export const assertPathValue = (key: string, value: string): void => {
  const problem = pathValueProblem(value)
  if (problem) throw new CacheSchemaError(`Parameter "${key}" is ${problem}`)
}
