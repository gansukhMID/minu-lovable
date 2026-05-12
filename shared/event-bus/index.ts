import { EventEmitter } from 'events'
import type { PlatformEvent } from './types'

export type {
  PlatformEvent,
  OrderCreatedPayload,
  StockLowPayload,
  StockInsufficientPayload,
  PaymentReceivedPayload,
} from './types'

const emitter = new EventEmitter()

export function publish<T extends PlatformEvent['type']>(
  event: T,
  payload: Extract<PlatformEvent, { type: T }>['payload']
): void {
  emitter.emit(event, payload)
}

export function subscribe<T extends PlatformEvent['type']>(
  event: T,
  handler: (payload: Extract<PlatformEvent, { type: T }>['payload']) => void | Promise<void>
): () => void {
  emitter.on(event, handler as (...args: unknown[]) => void)
  return () => emitter.off(event, handler as (...args: unknown[]) => void)
}
