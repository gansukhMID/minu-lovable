'use client'

import { useState, useEffect } from 'react'

export interface Movement {
  id: string
  product_id: string
  delta: number
  reason: string
  order_id: string | null
  created_at: string
}

export function useMovements() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/warehouse/movements')
      .then(r => r.json())
      .then(setMovements)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { movements, loading, error }
}
