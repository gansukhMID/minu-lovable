import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/shared/db';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { SandboxFactory } from '@/lib/sandbox/factory';
import { hasReconnect } from '@/lib/sandbox/provider-capabilities';

// POST /api/projects/[id]/sync
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [project] = await query<{ sandbox_id: string | null }>(
    'SELECT sandbox_id FROM projects WHERE id = $1',
    [id]
  );

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (!project.sandbox_id)
    return NextResponse.json({ error: 'No sandbox attached to project' }, { status: 400 });

  let provider = sandboxManager.getProvider(project.sandbox_id);

  if (!provider || !provider.isAlive()) {
    const fresh = SandboxFactory.create();
    if (hasReconnect(fresh)) {
      const info = await fresh.reconnect(project.sandbox_id);
      if (info) {
        sandboxManager.registerSandbox(info.sandboxId, fresh);
        provider = fresh;
      }
    }
  }

  if (!provider) {
    return NextResponse.json({ error: 'Sandbox is not running and could not reconnect' }, { status: 400 });
  }

  const files = await query<{ file_path: string; content: string }>(
    'SELECT file_path, content FROM project_files WHERE project_id = $1',
    [id]
  );

  if (files.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, total: 0 });
  }

  const results = await Promise.allSettled(
    files.map(f => provider!.writeFile(f.file_path, f.content))
  );

  const failed = results.filter(r => r.status === 'rejected').length;
  return NextResponse.json({ synced: files.length - failed, failed, total: files.length });
}
