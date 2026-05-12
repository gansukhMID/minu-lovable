import { Hono } from 'hono'
import { query } from '@/shared/db'

interface Product {
  id: string
  name: string
  price: string
  sku: string | null
  active: boolean
}

const products = new Hono()

products.get('/', async (c) => {
  const rows = await query<Product>('SELECT * FROM products WHERE active = true ORDER BY name')
  return c.json(rows)
})

products.post('/', async (c) => {
  const body = await c.req.json<{ name: string; price: number; sku?: string }>()
  const [row] = await query<Product>(
    'INSERT INTO products (name, price, sku) VALUES ($1, $2, $3) RETURNING *',
    [body.name, body.price, body.sku ?? null]
  )
  return c.json(row, 201)
})

export default products
