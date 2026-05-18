'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/shadcn/card'
import Button from '@/components/ui/shadcn/button'

interface Project {
  id: string
  name: string
  description: string | null
  sandbox_id: string | null
  sandbox_url: string | null
  message_count: number
  created_at: string
  updated_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json() as { projects: Project[] }
        setProjects(data.projects)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this project?')) return
    setDeleting(id)
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    setProjects(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  const open = (project: Project) => {
    const qs = new URLSearchParams({ project: project.id })
    if (project.sandbox_id) qs.set('sandbox', project.sandbox_id)
    router.push(`/generation?${qs}`)
  }

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Your saved web builder sessions</p>
        </div>
        <Button onClick={() => router.push('/generation')} size="large">
          + New Project
        </Button>
      </div>

      {loading && (
        <div className="text-center py-24 text-muted-foreground">Loading...</div>
      )}

      {!loading && projects.length === 0 && (
        <div className="text-center py-24 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No projects yet</p>
          <Button onClick={() => router.push('/generation')}>
            Create your first project
          </Button>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map(project => (
            <Card
              key={project.id}
              onClick={() => open(project)}
              className="cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base truncate">{project.name}</CardTitle>
                  <button
                    onClick={e => deleteProject(project.id, e)}
                    disabled={deleting === project.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive text-xs shrink-0"
                  >
                    {deleting === project.id ? '...' : 'Delete'}
                  </button>
                </div>
                <CardDescription className="flex flex-col gap-1 mt-1">
                  <span>{project.message_count} message{project.message_count !== 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-2">
                    {project.sandbox_id && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        sandbox
                      </span>
                    )}
                    <span>Updated {timeAgo(project.updated_at)}</span>
                  </span>
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
