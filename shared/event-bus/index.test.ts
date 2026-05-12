import { describe, it, expect, vi, beforeEach } from 'vitest'

// Reset the singleton emitter between tests by re-importing via dynamic import
// We use vi.resetModules() to get a fresh emitter for each test
describe('event-bus', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('publish calls subscriber with correct payload', async () => {
    const { publish, subscribe } = await import('./index')
    const handler = vi.fn()
    subscribe('order.created', handler)
    publish('order.created', { orderId: 'o1', items: [{ productId: 'p1', qty: 2 }], totalAmount: 100 })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ orderId: 'o1', items: [{ productId: 'p1', qty: 2 }], totalAmount: 100 })
  })

  it('multiple subscribers on same event all receive the payload', async () => {
    const { publish, subscribe } = await import('./index')
    const h1 = vi.fn()
    const h2 = vi.fn()
    subscribe('stock.low', h1)
    subscribe('stock.low', h2)
    publish('stock.low', { productId: 'p1', currentQty: 3, threshold: 10 })
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('unsubscribe stops future delivery', async () => {
    const { publish, subscribe } = await import('./index')
    const handler = vi.fn()
    const unsub = subscribe('payment.received', handler)
    unsub()
    publish('payment.received', { orderId: 'o1', paymentId: 'pay1', amount: 50 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('publishing an unknown event string is a no-op', async () => {
    const { publish } = await import('./index')
    expect(() =>
      (publish as (e: string, p: unknown) => void)('unknown.event', {})
    ).not.toThrow()
  })
})
