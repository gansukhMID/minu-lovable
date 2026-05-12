import type { Hono } from 'hono'
import type { PlatformEvent } from './event-bus/types'

export type EventType = PlatformEvent['type']

export interface Module {
  name: string
  version: string
  routes: Hono
  components: Record<string, unknown>
  schema: string
  events: {
    publishes: EventType[]
    subscribes: EventType[]
  }
  middlewareNeeds: string[]
}
