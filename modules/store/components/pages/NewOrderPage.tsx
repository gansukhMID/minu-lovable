'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select'
import Button from '@/components/ui/shadcn/button'
import { useProducts } from '../../hooks/useProducts'

interface LineItem {
  productId: string
  qty: number
  unitPrice: number
}

export function NewOrderPage() {
  const { products } = useProducts()
  const [items, setItems] = useState<LineItem[]>([{ productId: '', qty: 1, unitPrice: 0 }])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const addLine = () => setItems(prev => [...prev, { productId: '', qty: 1, unitPrice: 0 }])

  const updateLine = (idx: number, patch: Partial<LineItem>) =>
    setItems(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const selectProduct = (idx: number, productId: string) => {
    const product = products.find(p => p.id === productId)
    updateLine(idx, { productId, unitPrice: product ? Number(product.price) : 0 })
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      setResult(`Order created: ${data.id}`)
      setItems([{ productId: '', qty: 1, unitPrice: 0 }])
    } finally {
      setSubmitting(false)
    }
  }

  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  const canSubmit = items.every(i => i.productId && i.qty > 0) && !submitting

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold mb-4">New Order</h2>
      {result && (
        <div className="mb-4 p-3 bg-green-50 text-green-800 rounded border border-green-200 text-sm">
          {result}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((line, idx) => (
            <div key={idx} className="flex gap-3 items-center">
              <Select value={line.productId} onValueChange={v => selectProduct(idx, v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — ₮{Number(p.price).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="number"
                min={1}
                value={line.qty}
                onChange={e => updateLine(idx, { qty: Number(e.target.value) })}
                className="w-20 border rounded px-2 py-1.5 text-sm"
              />
            </div>
          ))}
          <Button variant="secondary" onClick={addLine} size="default">
            + Add item
          </Button>
          <div className="pt-4 border-t flex justify-between items-center">
            <span className="font-semibold">Total: ₮{total.toLocaleString()}</span>
            <Button disabled={!canSubmit} onClick={submit} isLoading={submitting}>
              Place Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
