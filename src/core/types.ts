import type { CloudEvent } from './cloudevents.js'

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
}

export type Dispatcher = {
  dispatch(input: DispatchInput): Promise<DispatchOutcome>
}

export type Logger = {
  debug?: (entry: Record<string, unknown>, message: string) => void
  info?: (entry: Record<string, unknown>, message: string) => void
  warn?: (entry: Record<string, unknown>, message: string) => void
  error?: (entry: Record<string, unknown>, message: string) => void
}
