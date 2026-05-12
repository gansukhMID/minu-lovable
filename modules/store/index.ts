import { Hono } from 'hono'
import type { Module } from '@/shared/types'
import orders from './routes/orders'
import products from './routes/products'
import payments from './routes/payments'
import * as components from './components'

const routes = new Hono()
routes.route('/orders', orders)
routes.route('/products', products)
routes.route('/orders', payments)

export const StoreModule: Module = {
  name: 'store',
  version: '1.0.0',
  routes,
  components: components as Record<string, unknown>,
  schema: './schema.sql',
  events: {
    publishes: ['order.created', 'payment.received'],
    subscribes: [],
  },
  middlewareNeeds: ['qr-payment'],
}
