import { Hono } from 'hono'
import { query } from '@/shared/db'
import { KhanBankAdapter } from '@/shared/middleware/qr-payment'

const payments = new Hono()
const adapter = new KhanBankAdapter()

payments.post('/:id/payment', async (c) => {
  const [order] = await query<{ id: string; total: string }>(
    'SELECT id, total FROM orders WHERE id = $1',
    [c.req.param('id')]
  )
  if (!order) return c.json({ error: 'not found' }, 404)

  const intent = await adapter.createPayment(Number(order.total), { orderId: order.id })
  return c.json({ qrCodeUrl: intent.qrCodeUrl, paymentId: intent.paymentId, expiresAt: intent.expiresAt })
})

payments.get('/:id/payment/status', async (c) => {
  const body = await c.req.json<{ paymentId: string }>()
  const status = await adapter.checkStatus(body.paymentId)
  return c.json({ status })
})

export default payments
