import { Hono } from 'hono'
import { query } from '@/shared/db'

interface Movement {
  id: string
  product_id: string
  delta: number
  reason: string
  order_id: string | null
  created_at: string
}

const movements = new Hono()

movements.get('/', async (c) => {
  const rows = await query<Movement>('SELECT * FROM stock_movements ORDER BY created_at DESC')
  return c.json(rows)
})

export default movements
