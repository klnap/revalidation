export class CacheRequestError extends Error {
  readonly code = 'CACHE_REQUEST_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CacheRequestError'
  }
}

export class CacheSourceError extends Error {
  readonly code = 'CACHE_SOURCE_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CacheSourceError'
  }
}

export class CacheSchemaError extends Error {
  readonly code = 'CACHE_SCHEMA_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CacheSchemaError'
  }
}

export class CacheResolutionError extends Error {
  readonly code = 'CACHE_RESOLUTION_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CacheResolutionError'
  }
}

/**
 * Host `resolve` could not map producer data to a rule key.
 * Throw via `invalidKey()` — consumer skips that wire item (warn log), not a failed POST.
 */
export class InvalidKeyError extends Error {
  readonly code = 'INVALID_CACHE_KEY'
  constructor(message = 'revalidation event missing cache key') {
    super(message)
    this.name = 'InvalidKeyError'
  }
}

export class CacheConfigurationError extends Error {
  readonly code = 'CACHE_CONFIGURATION_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CacheConfigurationError'
  }
}

export class CacheExecutionError extends Error {
  readonly code = 'CACHE_EXECUTION_ERROR'
  override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'CacheExecutionError'
    this.cause = cause
  }
}

/** Skip this wire item in host `resolve` (logged, does not fail the app or whole POST). */
export function invalidKey(): never {
  throw new InvalidKeyError()
}

export const toHttpStatus = (error: unknown): number => {
  if (error instanceof CacheRequestError) return 401
  if (
    error instanceof CacheSourceError ||
    error instanceof CacheSchemaError ||
    error instanceof CacheResolutionError ||
    error instanceof CacheConfigurationError
  ) {
    return 400
  }
  return 500
}
