import type { CloudEvent } from './cloudevents.js'

export type CacheMode = 'stale' | 'expire'

export type CacheEntry = {
  value: string
  mode: CacheMode
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
}

export type DeliveryStatus = 'accepted' | 'rejected' | 'failed' | 'unknown'

export type TargetDispatchResult = {
  target: string
  deliveryId: string
  status: DeliveryStatus
  attempts: number
  error?: DispatchError
}

export type DispatchOutcome =
  | { status: 'accepted'; results: readonly TargetDispatchResult[] }
  | { status: 'partial'; results: readonly TargetDispatchResult[] }
  | {
      status: 'rejected' | 'failed' | 'unknown'
      results: readonly TargetDispatchResult[]
    }

export type DispatchInput = {
  events: readonly CloudEvent[]
  /** Manual override; this narrows configured targets and never bypasses target filters. */
  targets?: readonly string[]
}

export type Dispatcher = {
  dispatch(input: DispatchInput): Promise<DispatchOutcome>
  /**
   * Most CloudEvents sent in one target request. Omitted means the default (100).
   */
  maxEventItems?: number
}

export type Logger = {
  debug?: (entry: Record<string, unknown>, message: string) => void
  info?: (entry: Record<string, unknown>, message: string) => void
  warn?: (entry: Record<string, unknown>, message: string) => void
  error?: (entry: Record<string, unknown>, message: string) => void
}
