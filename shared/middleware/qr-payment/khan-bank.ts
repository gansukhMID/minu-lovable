import type { QRPaymentAdapter, PaymentIntent, PaymentStatus } from './index'

export class KhanBankAdapter implements QRPaymentAdapter {
  async createPayment(_amount: number, _metadata?: Record<string, string>): Promise<PaymentIntent> {
    // TODO: implement createPayment with KhanBank QPay API
    throw new Error('not implemented')
  }

  async checkStatus(_paymentId: string): Promise<PaymentStatus> {
    // TODO: implement checkStatus with KhanBank QPay API
    throw new Error('not implemented')
  }

  async refund(_paymentId: string): Promise<void> {
    // TODO: implement refund with KhanBank QPay API
    throw new Error('not implemented')
  }
}
