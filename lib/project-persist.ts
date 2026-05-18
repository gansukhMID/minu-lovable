import { query } from '@/shared/db';

export type PersistedFile = { path: string; content: string };

/** Upsert sandbox files into project_files + append a snapshot row (best-effort; skips if DATABASE_URL unset). */
export async function persistApplyToProject(
  projectId: string | undefined,
  files: PersistedFile[],
  summary: string
): Promise<string | undefined> {
  if (!projectId || !process.env.DATABASE_URL || files.length === 0) {
    return undefined;
  }
  try {
    for (const f of files) {
      await query(
        `INSERT INTO project_files (project_id, file_path, content, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project_id, file_path)
         DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [projectId, f.path, f.content]
      );
    }
    const snapshotObj = Object.fromEntries(files.map((f) => [f.path, f.content]));
    const rows = await query<{ id: string }>(
      `INSERT INTO project_snapshots (project_id, summary, files_snapshot)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [projectId, summary.slice(0, 500), JSON.stringify(snapshotObj)]
    );
    return rows[0]?.id;
  } catch (e) {
    console.warn('[persistApplyToProject] skipped/failed:', e);
    return undefined;
  }
}
