export interface OrderCreatedPayload {
  orderId: string
  items: Array<{ productId: string; qty: number }>
  totalAmount: number
}

export interface StockLowPayload {
  productId: string
  currentQty: number
  threshold: number
}

export interface StockInsufficientPayload {
  productId: string
  requestedQty: number
  availableQty: number
}

export interface PaymentReceivedPayload {
  orderId: string
  paymentId: string
  amount: number
}

export type PlatformEvent =
  | { type: 'order.created'; payload: OrderCreatedPayload }
  | { type: 'stock.low'; payload: StockLowPayload }
  | { type: 'stock.insufficient'; payload: StockInsufficientPayload }
  | { type: 'payment.received'; payload: PaymentReceivedPayload }
