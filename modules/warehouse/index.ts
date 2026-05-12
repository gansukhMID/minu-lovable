import { Hono } from 'hono'
import type { Module } from '@/shared/types'
import stock from './routes/stock'
import movements from './routes/movements'
import { registerWarehouseHandlers } from './events/handlers'
import * as components from './components'

registerWarehouseHandlers()

const routes = new Hono()
routes.route('/stock', stock)
routes.route('/movements', movements)

export const WarehouseModule: Module = {
  name: 'warehouse',
  version: '1.0.0',
  routes,
  components: components as Record<string, unknown>,
  schema: './schema.sql',
  events: {
    publishes: ['stock.low', 'stock.insufficient'],
    subscribes: ['order.created'],
  },
  middlewareNeeds: [],
}
