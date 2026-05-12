import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/shared/db'

export async function GET() {
  const projects = await query<{
    id: string
    name: string
    description: string | null
    sandbox_id: string | null
    sandbox_url: string | null
    created_at: string
    updated_at: string
  }>(`
    SELECT p.*, COUNT(m.id)::int AS message_count
    FROM projects p
    LEFT JOIN chat_messages m ON m.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `)
  return NextResponse.json({ projects })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const name = body.name || 'Untitled Project'
  const description = body.description || null

  const [project] = await query<{ id: string; name: string; created_at: string }>(
    'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
    [name, description]
  )
  return NextResponse.json({ project }, { status: 201 })
}
