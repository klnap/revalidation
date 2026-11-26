import type { StandardSchemaV1 } from '@standard-schema/spec'
import { CacheSchemaError } from './errors.js'

export const validateStandardSchema = async <TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
  value: unknown,
): Promise<TOutput> => {
  const result = await schema['~standard'].validate(value)
  if (result.issues) throw new CacheSchemaError('Schema validation failed')
  return result.value
}
