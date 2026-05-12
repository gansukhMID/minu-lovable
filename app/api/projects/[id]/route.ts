import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/shared/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project] = await query('SELECT * FROM projects WHERE id = $1', [id])
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ project })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { name, description, sandbox_id, sandbox_url, sandbox_provider } = body

  const [project] = await query(
    `UPDATE projects SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       sandbox_id = COALESCE($3, sandbox_id),
       sandbox_url = COALESCE($4, sandbox_url),
       sandbox_provider = COALESCE($5, sandbox_provider),
       updated_at = now()
     WHERE id = $6 RETURNING *`,
    [name, description, sandbox_id, sandbox_url, sandbox_provider, id]
  )
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ project })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await query('DELETE FROM projects WHERE id = $1', [id])
  return NextResponse.json({ success: true })
}
