import { describe, expect, it } from 'bun:test'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { validateStandardSchema } from '../../../src/core/standard-schema.ts'

describe('Standard Schema V1 validation', () => {
  it('returns the transformed output from a synchronous schema', async () => {
    const schema: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => ({ value: Number(value) }),
      },
    }

    await expect(validateStandardSchema(schema, '42')).resolves.toBe(42)
  })

  it('awaits asynchronous schemas', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => ({ value: String(value).trim() }),
      },
    }

    await expect(validateStandardSchema(schema, '  page  ')).resolves.toBe('page')
  })

  it('rejects failures without exposing submitted values', async () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [{ message: 'invalid field', path: ['secret'] }],
        }),
      },
    }

    await expect(validateStandardSchema(schema, { secret: 'private-value' })).rejects.toThrow(
      'Schema validation failed',
    )
  })
})
