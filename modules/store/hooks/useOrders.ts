'use client'

import { useState, useEffect } from 'react'

export interface Order {
  id: string
  status: string
  customer_id: string | null
  total: string
  created_at: string
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/store/orders')
      .then(r => r.json())
      .then(setOrders)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { orders, loading, error }
}
