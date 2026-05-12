export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface PaymentIntent {
  paymentId: string
  qrCodeUrl: string
  expiresAt: Date
}

export interface QRPaymentAdapter {
  createPayment(amount: number, metadata?: Record<string, string>): Promise<PaymentIntent>
  checkStatus(paymentId: string): Promise<PaymentStatus>
  refund(paymentId: string): Promise<void>
}

export { KhanBankAdapter } from './khan-bank'
export { GolomtAdapter } from './golomt'
