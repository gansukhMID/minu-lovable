import { NextRequest, NextResponse } from 'next/server'
import { sandboxManager } from '@/lib/sandbox/sandbox-manager'
import {
  getMinuSandboxBaseUrl,
  minuContainerDeleteForStoredSandboxKey,
} from '@/lib/sandbox/minu-container-api'
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
  const rows = await query(
    'SELECT id, sandbox_id, sandbox_provider FROM projects WHERE id = $1',
    [id],
  )
  const project = rows[0] as
    | { id: string; sandbox_id: string | null; sandbox_provider: string | null }
    | undefined
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const sandboxId = project.sandbox_id?.trim() || null
  const providerRaw = project.sandbox_provider || 'minu'
  const providerId = String(providerRaw).toLowerCase()
  const shouldMinuRemoteDelete =
    !!sandboxId && !['vercel', 'e2b', 'codesandbox'].includes(providerId)

  if (shouldMinuRemoteDelete) {
    try {
      const base = getMinuSandboxBaseUrl()
      console.log('[projects DELETE] Minu DELETE sandbox_id=', sandboxId, 'base=', base)
      await minuContainerDeleteForStoredSandboxKey(base, sandboxId)
    } catch (e) {
      console.warn('[projects DELETE] Minu container delete failed (continuing):', e)
    }
  }

  sandboxManager.removeFromRegistry(sandboxId || '')

  const gsid =
    global.activeSandboxProvider?.getSandboxInfo?.()?.sandboxId ?? global.sandboxData?.sandboxId
  if (sandboxId && gsid === sandboxId) {
    global.activeSandboxProvider = null
    global.activeSandbox = null
    global.sandboxData = null
    if (global.sandboxState?.fileCache?.sandboxId === sandboxId) {
      global.sandboxState.fileCache = null
    }
    global.existingFiles?.clear()
  }

  await query('DELETE FROM projects WHERE id = $1', [id])
  return NextResponse.json({ success: true })
}
