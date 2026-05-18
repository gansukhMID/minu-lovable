import { NextRequest, NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { query } from '@/shared/db';

/**
 * Minimal single-file write for UI “revert this file”.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const sandboxId = typeof body.sandboxId === 'string' ? body.sandboxId : undefined;
    const projectId = typeof body.projectId === 'string' ? body.projectId : undefined;

    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    let provider =
      (sandboxId ? sandboxManager.getProvider(sandboxId) : null) || sandboxManager.getActiveProvider();

    if (!provider?.isAlive?.()) {
      provider = (global as any).activeSandboxProvider;
    }

    if (!provider?.writeFile) {
      return NextResponse.json({ error: 'No active sandbox provider' }, { status: 400 });
    }
    await provider.writeFile(path, content);

    if (projectId && process.env.DATABASE_URL) {
      await query(
        `INSERT INTO project_files (project_id, file_path, content, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project_id, file_path)
         DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [projectId, path, content],
      ).catch(() => undefined);
      return NextResponse.json({ success: true, projectSynced: true });
    }

    return NextResponse.json({ success: true, projectSynced: Boolean(projectId) });
  } catch (e) {
    console.error('[sandbox-write-file]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 },
    );
  }
}
