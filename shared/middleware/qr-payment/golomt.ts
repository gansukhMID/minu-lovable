import type { QRPaymentAdapter, PaymentIntent, PaymentStatus } from './index'

export class GolomtAdapter implements QRPaymentAdapter {
  async createPayment(_amount: number, _metadata?: Record<string, string>): Promise<PaymentIntent> {
    // TODO: implement createPayment with Golomt Bank API
    throw new Error('not implemented')
  }

  async checkStatus(_paymentId: string): Promise<PaymentStatus> {
    // TODO: implement checkStatus with Golomt Bank API
    throw new Error('not implemented')
  }

  async refund(_paymentId: string): Promise<void> {
    // TODO: implement refund with Golomt Bank API
    throw new Error('not implemented')
  }
}
