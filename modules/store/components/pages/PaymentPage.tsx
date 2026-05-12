'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/shadcn/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/shadcn/dialog'
import Button from '@/components/ui/shadcn/button'

interface PaymentState {
  qrCodeUrl: string
  paymentId: string
  expiresAt: string
}

interface Props {
  orderId: string
}

export function PaymentPage({ orderId }: Props) {
  const [payment, setPayment] = useState<PaymentState | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const initiatePayment = async () => {
    setLoading(true)
    const res = await fetch(`/api/store/orders/${orderId}/payment`, { method: 'POST' })
    const data = await res.json() as PaymentState
    setPayment(data)
    setOpen(true)
    setLoading(false)
  }

  useEffect(() => {
    if (!payment) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/store/orders/${orderId}/payment/status`, {
        method: 'GET',
      })
      const data = await res.json() as { status: string }
      setStatus(data.status)
      if (data.status === 'paid' || data.status === 'failed') {
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [payment, orderId])

  return (
    <div className="p-6 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>QR Payment</CardTitle>
          <CardDescription>Order #{orderId.slice(0, 8)}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'paid' && (
            <div className="mb-4 p-3 bg-green-50 text-green-800 rounded text-sm">Payment received!</div>
          )}
          <Button onClick={initiatePayment} isLoading={loading} disabled={status === 'paid'}>
            Generate QR Code
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan to Pay</DialogTitle>
            <DialogDescription>
              {status ? `Status: ${status}` : 'Waiting for payment…'}
            </DialogDescription>
          </DialogHeader>
          {payment && (
            <div className="flex flex-col items-center gap-4 py-4">
              <img src={payment.qrCodeUrl} alt="QR Code" className="w-48 h-48 border rounded" />
              <p className="text-xs text-muted-foreground">
                Expires: {new Date(payment.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
