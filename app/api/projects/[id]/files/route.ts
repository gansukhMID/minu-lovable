import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/shared/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const files = await query(
    'SELECT file_path, content, updated_at FROM project_files WHERE project_id = $1 ORDER BY file_path',
    [id]
  )
  return NextResponse.json({ files })
}

// Upsert one or more files: body = { files: [{ path, content }] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { files } = await request.json() as { files: { path: string; content: string }[] }

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'files array required' }, { status: 400 })
  }

  const saved = await Promise.all(
    files.map(({ path, content }) =>
      query(
        `INSERT INTO project_files (project_id, file_path, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, file_path) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
         RETURNING file_path, updated_at`,
        [id, path, content]
      ).then(rows => rows[0])
    )
  )

  await query('UPDATE projects SET updated_at = now() WHERE id = $1', [id])

  return NextResponse.json({ saved })
}
