import { describe, it, expect, vi, beforeEach } from 'vitest'
import { publishOrderCreated } from './publisher'

vi.mock('@/shared/event-bus', () => ({
  publish: vi.fn(),
}))

describe('publishOrderCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes order.created with correct payload', async () => {
    const { publish } = await import('@/shared/event-bus')

    const payload = {
      orderId: 'order-1',
      items: [{ productId: 'prod-1', qty: 3 }],
      totalAmount: 150,
    }

    publishOrderCreated(payload)

    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith('order.created', payload)
  })

  it('propagates all items in the payload', async () => {
    const { publish } = await import('@/shared/event-bus')

    const payload = {
      orderId: 'order-2',
      items: [
        { productId: 'prod-1', qty: 2 },
        { productId: 'prod-2', qty: 5 },
      ],
      totalAmount: 700,
    }

    publishOrderCreated(payload)

    const [, sentPayload] = (publish as ReturnType<typeof vi.fn>).mock.calls[0] as [string, typeof payload]
    expect(sentPayload.items).toHaveLength(2)
    expect(sentPayload.totalAmount).toBe(700)
  })
})
