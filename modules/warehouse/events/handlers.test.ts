import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPublish = vi.fn()
const mockWithTransaction = vi.fn()
const mockSubscribe = vi.fn()

vi.mock('@/shared/event-bus', () => ({
  subscribe: mockSubscribe,
  publish: mockPublish,
}))

vi.mock('@/shared/db', () => ({
  withTransaction: mockWithTransaction,
}))

describe('warehouse order.created handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe.mockImplementation((_event: string, handler: (p: unknown) => Promise<void>) => {
      ;(mockSubscribe as { _handler?: (p: unknown) => Promise<void> })._handler = handler
      return () => {}
    })
  })

  async function triggerHandler(payload: unknown) {
    const { registerWarehouseHandlers } = await import('./handlers')
    registerWarehouseHandlers()
    const handler = (mockSubscribe as { _handler?: (p: unknown) => Promise<void> })._handler
    if (handler) await handler(payload)
  }

  it('deducts stock and records movement when stock is sufficient', async () => {
    const clientQuery = vi.fn()
    clientQuery
      .mockResolvedValueOnce({ rows: [{ qty: 10, low_threshold: 2 }] }) // SELECT FOR UPDATE product-1
      .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
      .mockResolvedValueOnce({ rows: [] }) // INSERT movement
      .mockResolvedValueOnce({ rows: [{ qty: 7, low_threshold: 2 }] }) // SELECT post-deduct

    mockWithTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
      await fn({ query: clientQuery })
    })

    await triggerHandler({
      orderId: 'order-1',
      items: [{ productId: 'product-1', qty: 3 }],
      totalAmount: 90,
    })

    expect(mockWithTransaction).toHaveBeenCalledOnce()
    expect(clientQuery).toHaveBeenCalledWith(
      'UPDATE stock SET qty = qty - $1 WHERE product_id = $2',
      [3, 'product-1']
    )
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      ['product-1', -3, 'order', 'order-1']
    )
    expect(mockPublish).not.toHaveBeenCalledWith('stock.insufficient', expect.anything())
  })

  it('emits stock.insufficient and rolls back when stock is insufficient', async () => {
    const clientQuery = vi.fn()
    clientQuery.mockResolvedValueOnce({ rows: [{ qty: 2, low_threshold: 5 }] }) // SELECT FOR UPDATE → insufficient

    mockWithTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
      await fn({ query: clientQuery })
    })

    await triggerHandler({
      orderId: 'order-2',
      items: [{ productId: 'product-x', qty: 5 }],
      totalAmount: 150,
    })

    expect(mockPublish).toHaveBeenCalledWith('stock.insufficient', {
      productId: 'product-x',
      requestedQty: 5,
      availableQty: 2,
    })
    expect(clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stock'),
      expect.anything()
    )
  })
})
