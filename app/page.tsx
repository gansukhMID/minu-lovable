'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/shadcn/card'
import Button from '@/components/ui/shadcn/button'

const MODULES = [
  {
    id: 'store',
    title: 'Store',
    description: 'Orders, products, and QR payment processing',
    icon: '🛒',
  },
  {
    id: 'warehouse',
    title: 'Warehouse',
    description: 'Stock levels and inventory movement tracking',
    icon: '📦',
  },
] as const

export default function HomePage() {
  const [selected, setSelected] = useState<string[]>([])
  const router = useRouter()

  const toggle = (id: string) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )

  const handleStart = () =>
    router.push(`/generation?modules=${selected.join(',')}`)

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-bold">Choose your modules</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {MODULES.map(mod => (
          <Card
            key={mod.id}
            onClick={() => toggle(mod.id)}
            className={`cursor-pointer transition-all ${
              selected.includes(mod.id) ? 'ring-2 ring-primary' : ''
            }`}
          >
            <CardHeader>
              <CardTitle>
                {mod.icon} {mod.title}
              </CardTitle>
              <CardDescription>{mod.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Button disabled={selected.length === 0} onClick={handleStart} size="large">
        Start Building
      </Button>
    </main>
  )
}
