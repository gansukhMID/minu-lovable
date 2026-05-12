import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/shared/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messages = await query(
    'SELECT * FROM chat_messages WHERE project_id = $1 ORDER BY created_at ASC',
    [id]
  )
  return NextResponse.json({ messages })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { role, content, message_type = 'text', metadata } = await request.json()

  if (!role || !content) {
    return NextResponse.json({ error: 'role and content are required' }, { status: 400 })
  }

  const [message] = await query(
    `INSERT INTO chat_messages (project_id, role, content, message_type, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, role, content, message_type, metadata ? JSON.stringify(metadata) : null]
  )

  await query('UPDATE projects SET updated_at = now() WHERE id = $1', [id])

  return NextResponse.json({ message }, { status: 201 })
}
