import { Hono } from 'hono'
import { query, withTransaction } from '@/shared/db'
import { publishOrderCreated } from '../events/publisher'

interface Order {
  id: string
  status: string
  customer_id: string | null
  total: string
  created_at: string
}

interface OrderItem {
  id: string
  order_id: string
  product_id: string
  qty: number
  unit_price: string
}

const orders = new Hono()

orders.get('/', async (c) => {
  const rows = await query<Order>('SELECT * FROM orders ORDER BY created_at DESC')
  return c.json(rows)
})

orders.post('/', async (c) => {
  const body = await c.req.json<{
    customerId?: string
    items: Array<{ productId: string; qty: number; unitPrice: number }>
  }>()

  const total = body.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)

  const order = await withTransaction(async (client) => {
    const result = await client.query<Order>(
      'INSERT INTO orders (customer_id, total) VALUES ($1, $2) RETURNING *',
      [body.customerId ?? null, total]
    )
    const created = result.rows[0]

    for (const item of body.items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES ($1, $2, $3, $4)',
        [created.id, item.productId, item.qty, item.unitPrice]
      )
    }

    return created
  })

  publishOrderCreated({
    orderId: order.id,
    items: body.items.map(i => ({ productId: i.productId, qty: i.qty })),
    totalAmount: total,
  })

  return c.json(order, 201)
})

orders.get('/:id', async (c) => {
  const [order] = await query<Order>('SELECT * FROM orders WHERE id = $1', [c.req.param('id')])
  if (!order) return c.json({ error: 'not found' }, 404)
  const items = await query<OrderItem>('SELECT * FROM order_items WHERE order_id = $1', [order.id])
  return c.json({ ...order, items })
})

orders.patch('/:id/status', async (c) => {
  const body = await c.req.json<{ status: string }>()
  const [row] = await query<Order>(
    'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
    [body.status, c.req.param('id')]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

export default orders
