'use client'

import { useState, useEffect } from 'react'

export interface Product {
  id: string
  name: string
  price: string
  sku: string | null
  active: boolean
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/store/products')
      .then(r => r.json())
      .then(setProducts)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { products, loading, error }
}
