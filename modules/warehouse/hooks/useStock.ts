'use client'

import { useState, useEffect } from 'react'

export interface StockRow {
  product_id: string
  qty: number
  reserved_qty: number
  low_threshold: number
}

export function useStock() {
  const [stock, setStock] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/warehouse/stock')
      .then(r => r.json())
      .then(setStock)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { stock, loading, error }
}
