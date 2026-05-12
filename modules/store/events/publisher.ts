import { publish } from '@/shared/event-bus'
import type { OrderCreatedPayload } from '@/shared/event-bus/types'

export function publishOrderCreated(payload: OrderCreatedPayload): void {
  publish('order.created', payload)
}
