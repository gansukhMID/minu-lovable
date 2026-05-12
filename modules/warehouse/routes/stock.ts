import { Hono } from 'hono'
import { query } from '@/shared/db'

interface StockRow {
  product_id: string
  qty: number
  reserved_qty: number
  low_threshold: number
}

const stock = new Hono()

stock.get('/', async (c) => {
  const rows = await query<StockRow>('SELECT * FROM stock ORDER BY product_id')
  return c.json(rows)
})

stock.get('/:productId', async (c) => {
  const [row] = await query<StockRow>(
    'SELECT * FROM stock WHERE product_id = $1',
    [c.req.param('productId')]
  )
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

export default stock
