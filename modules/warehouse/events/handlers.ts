import { subscribe, publish } from '@/shared/event-bus'
import { withTransaction } from '@/shared/db'
import type { PoolClient } from 'pg'

interface StockRow {
  qty: number
  low_threshold: number
}

export function registerWarehouseHandlers(): void {
  subscribe('order.created', async (payload) => {
    try {
      await withTransaction(async (client: PoolClient) => {
        for (const item of payload.items) {
          const result = await client.query<StockRow>(
            'SELECT qty, low_threshold FROM stock WHERE product_id = $1 FOR UPDATE',
            [item.productId]
          )
          const row = result.rows[0]
          if (!row || row.qty < item.qty) {
            publish('stock.insufficient', {
              productId: item.productId,
              requestedQty: item.qty,
              availableQty: row?.qty ?? 0,
            })
            throw new Error('insufficient_stock')
          }
        }

        for (const item of payload.items) {
          await client.query(
            'UPDATE stock SET qty = qty - $1 WHERE product_id = $2',
            [item.qty, item.productId]
          )
          await client.query(
            'INSERT INTO stock_movements (product_id, delta, reason, order_id) VALUES ($1, $2, $3, $4)',
            [item.productId, -item.qty, 'order', payload.orderId]
          )
        }

        for (const item of payload.items) {
          const result = await client.query<StockRow>(
            'SELECT qty, low_threshold FROM stock WHERE product_id = $1',
            [item.productId]
          )
          const row = result.rows[0]
          if (row && row.qty <= row.low_threshold) {
            publish('stock.low', {
              productId: item.productId,
              currentQty: row.qty,
              threshold: row.low_threshold,
            })
          }
        }
      })
    } catch (err) {
      if ((err as Error).message !== 'insufficient_stock') throw err
    }
  })
}
