export type CacheMode = 'stale' | 'expire'

export type CacheEntry = {
  value: string
  mode: CacheMode
}

export type CacheEvent = {
  source: string
  data: unknown
}

export type CacheResolverOutput =
  | string
  | CacheEntry
  | readonly (string | CacheEntry)[]
  | null
  | undefined

export type CacheResolver<TData = unknown> = (data: TData) => CacheResolverOutput

export type LayerRule = {
  tags?: readonly string[]
  paths?: readonly string[]
}

export type LayerOperations = {
  tags: CacheEntry[]
  paths: CacheEntry[]
}

export type LayerInspectResult = Record<string, LayerOperations>

export type InspectResult = {
  source: string
  items: unknown[]
  cacheKeys: string[]
  layers: LayerInspectResult
}

export type DispatchError = {
  code: string
  message: string
  cause?: unknown
}

export type TargetDispatchResult = {
  targetIndex: number
  status: DispatchOutcome['status']
  error?: DispatchError
}

export type DispatchOutcome =
  | { status: 'accepted'; deliveryIds?: string[]; results?: TargetDispatchResult[] }
  | { status: 'rejected'; error: DispatchError; results?: TargetDispatchResult[] }
  | { status: 'failed'; error: DispatchError; results?: TargetDispatchResult[] }
  | { status: 'unknown'; error: DispatchError; results?: TargetDispatchResult[] }

export type DispatchInput = {
  events: CacheEvent[]
  deduplicationId?: string
}

export type Dispatcher = {
  dispatch(input: DispatchInput): Promise<DispatchOutcome>
}

/** Alias for dispatcher factory return type. */
export type DispatcherFunction = Dispatcher

export type Logger = {
  debug?: (entry: Record<string, unknown>, message: string) => void
  info?: (entry: Record<string, unknown>, message: string) => void
  warn?: (entry: Record<string, unknown>, message: string) => void
  error?: (entry: Record<string, unknown>, message: string) => void
}
