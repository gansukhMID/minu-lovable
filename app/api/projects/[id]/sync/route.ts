import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/shared/db'
import { sandboxManager } from '@/lib/sandbox/sandbox-manager'

// POST /api/projects/[id]/sync
// Writes all project_files from DB into the live sandbox
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [project] = await query<{ sandbox_id: string | null }>(
    'SELECT sandbox_id FROM projects WHERE id = $1',
    [id]
  )

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!project.sandbox_id) return NextResponse.json({ error: 'No sandbox attached to project' }, { status: 400 })

  const provider = sandboxManager.getProvider(project.sandbox_id)
  if (!provider || !provider.isAlive()) {
    return NextResponse.json({ error: 'Sandbox is not running' }, { status: 400 })
  }

  const files = await query<{ file_path: string; content: string }>(
    'SELECT file_path, content FROM project_files WHERE project_id = $1',
    [id]
  )

  const results = await Promise.allSettled(
    files.map(f => provider.writeFile(f.file_path, f.content))
  )

  const failed = results.filter(r => r.status === 'rejected').length
  return NextResponse.json({ synced: files.length - failed, failed, total: files.length })
}
