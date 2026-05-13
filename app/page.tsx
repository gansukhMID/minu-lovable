'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [projectName, setProjectName] = useState('')
  const router = useRouter()

  const handleStart = () => {
    const name = projectName.trim()
    if (!name) return
    router.push(`/generation?projectName=${encodeURIComponent(name)}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="absolute top-4 right-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          My Projects →
        </button>
      </div>

      <h1 className="text-3xl font-bold">Шинэ project үүсгэх</h1>

      <div className="flex flex-col gap-3 w-full max-w-md">
        <input
          type="text"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
          placeholder="Project-ийн нэр..."
          className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-base"
          autoFocus
        />
        <button
          disabled={!projectName.trim()}
          onClick={handleStart}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-base transition-opacity disabled:opacity-40 hover:opacity-90"
        >
          Эхлэх →
        </button>
      </div>
    </main>
  )
}
