import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/shared/db';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { SandboxFactory } from '@/lib/sandbox/factory';
import { hasReconnect } from '@/lib/sandbox/provider-capabilities';
import { injectPreviewConsoleReporter } from '@/lib/sandbox/inject-preview-console-reporter';

/**
 * POST — restore sandbox + project_files from one saved snapshot JSON.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; sid: string }> }) {
  const { id: projectId, sid: snapshotId } = await ctx.params;

  const [project] = await query<{ sandbox_id: string | null }>(
    'SELECT sandbox_id FROM projects WHERE id = $1',
    [projectId]
  );

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (!project.sandbox_id) {
    return NextResponse.json({ error: 'No sandbox attached to project' }, { status: 400 });
  }

  const [snapRow] = await query<{ files_snapshot: Record<string, string> }>(
    'SELECT files_snapshot FROM project_snapshots WHERE id = $1 AND project_id = $2',
    [snapshotId, projectId]
  );

  if (!snapRow?.files_snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  let provider = sandboxManager.getProvider(project.sandbox_id);
  if (!provider || !provider.isAlive?.()) {
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
    return NextResponse.json({ error: 'Sandbox unavailable' }, { status: 400 });
  }

  const entries = Object.entries(snapRow.files_snapshot);
  let failed = 0;

  for (const [filePath, content] of entries) {
    try {
      await provider.writeFile(filePath, content);
      await query(
        `INSERT INTO project_files (project_id, file_path, content, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project_id, file_path) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [projectId, filePath, content]
      );
    } catch (e) {
      console.error('[restore-snapshot] write failed', filePath, e);
      failed++;
    }
  }

  await injectPreviewConsoleReporter(provider);

  return NextResponse.json({
    restored: entries.length - failed,
    failed,
    total: entries.length,
  });
}
