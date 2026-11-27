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

export class CacheConfigurationError extends Error {
  readonly code = 'CACHE_CONFIGURATION_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CacheConfigurationError'
  }
}
