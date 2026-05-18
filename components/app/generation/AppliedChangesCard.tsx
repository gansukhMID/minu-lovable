'use client';

import { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export type AppliedChangesSummary = {
  created: string[];
  updated: string[];
  packagesInstalled: string[];
  snapshotId?: string;
};

type Props = {
  alignRight?: boolean;
  /** Optional plan context — shown above the file/package lists when apply succeeded */
  planTitle?: string;
  planSummary?: string;
  planSteps?: string[];
  summary: AppliedChangesSummary;
  preApplySnapshot?: Record<string, string>;
  sandboxId?: string;
  projectId?: string | null;
  sandboxFilesLookup?: Record<string, string>;
  onRestoreSnapshot: (snapshotId: string | undefined) => void | Promise<void>;
  onAfterRevert?: () => void | Promise<void>;
};

function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'tsx' || ext === 'ts') return 'typescript';
  if (ext === 'jsx' || ext === 'js') return 'javascript';
  if (ext === 'css') return 'css';
  if (ext === 'json') return 'json';
  if (ext === 'html') return 'html';
  return 'text';
}

export default function AppliedChangesCard({
  alignRight,
  planTitle,
  planSummary,
  planSteps,
  summary,
  preApplySnapshot,
  sandboxId,
  projectId,
  sandboxFilesLookup,
  onRestoreSnapshot,
  onAfterRevert,
}: Props) {
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const allPaths = useMemo(() => {
    const s = new Set<string>();
    summary.created.forEach((p) => s.add(p));
    summary.updated.forEach((p) => s.add(p));
    return [...s];
  }, [summary.created, summary.updated]);

  async function revertFile(path: string) {
    const prev = preApplySnapshot?.[path];
    setBusyPath(path);
    try {
      if (!prev) {
        window.alert(`No buffered “before apply” snapshot for ${path}.`);
        return;
      }
      const res = await fetch('/api/sandbox-write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId, path, content: prev, projectId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error || 'Revert failed');

      await onAfterRevert?.();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyPath(null);
    }
  }

  const n =
    summary.created.length + summary.updated.length + summary.packagesInstalled.length;

  return (
    <div className={`mt-8 text-xs max-w-[80%] ${alignRight ? 'ml-auto' : 'mr-auto'}`}>
      <details className="rounded-lg border border-gray-200 bg-gray-50 px-8 py-6 text-gray-800">
        <summary className="cursor-pointer font-semibold">
          Applied changes{n ? ` (${n})` : ''}
        </summary>
        <div className="mt-8 space-y-6">
          {(planTitle || planSummary || (planSteps && planSteps.length > 0)) ? (
            <div className="rounded-md border border-blue-100 bg-blue-50/50 px-8 py-6">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 mb-4">
                What we planned
              </div>
              {planTitle ? (
                <div className="text-sm font-semibold text-gray-900 mb-4">{planTitle}</div>
              ) : null}
              {planSummary ? (
                <p className="text-xs text-gray-600 whitespace-pre-wrap mb-4">{planSummary}</p>
              ) : null}
              {planSteps && planSteps.length > 0 ? (
                <ol className="list-decimal pl-16 space-y-3 text-xs text-gray-700">
                  {planSteps.map((s, i) => (
                    <li key={i} className="pl-2">
                      {s}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
          {summary.created?.length ? (
            <div>
              <div className="font-medium text-gray-600 mb-4">Created / touched</div>
              <div className="flex flex-wrap gap-4">
                {summary.created.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-white border border-gray-200 px-6 py-2 font-mono"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {summary.updated?.length ? (
            <div>
              <div className="font-medium text-gray-600 mb-4">Updated</div>
              <div className="flex flex-wrap gap-4">
                {summary.updated.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-amber-50 border border-amber-200 px-6 py-2 font-mono"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {summary.packagesInstalled?.length ? (
            <div>
              <div className="font-medium text-gray-600 mb-4">Packages</div>
              <div className="flex flex-wrap gap-4">
                {summary.packagesInstalled.map((p) => (
                  <span key={p} className="rounded bg-blue-50 border border-blue-200 px-6 py-2">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {allPaths.map((path) => {
            const prev = preApplySnapshot?.[path];
            const next = sandboxFilesLookup?.[path];
            return (
              <details key={path} className="rounded border border-gray-200 bg-white">
                <summary className="cursor-pointer px-8 py-6 font-mono text-[11px]">
                  Diff: {path}
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 border-t border-gray-100">
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 mb-4">Before</div>
                    <SyntaxHighlighter
                      language={langFromPath(path)}
                      style={vscDarkPlus}
                      customStyle={{ margin: 0, maxHeight: 240, fontSize: 11 }}
                      showLineNumbers
                    >
                      {prev ?? '— no prior snapshot —'}
                    </SyntaxHighlighter>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 mb-4">After (sandbox)</div>
                    <SyntaxHighlighter
                      language={langFromPath(path)}
                      style={vscDarkPlus}
                      customStyle={{ margin: 0, maxHeight: 240, fontSize: 11 }}
                      showLineNumbers
                    >
                      {typeof next === 'string'
                        ? next
                        : '— sandbox state not loaded yet — reopen files or regenerate —'}
                    </SyntaxHighlighter>
                  </div>
                </div>
                <div className="px-8 pb-8">
                  <button
                    type="button"
                    disabled={busyPath === path || !prev}
                    className="text-sm font-semibold text-red-700 hover:underline disabled:opacity-40"
                    onClick={() => void revertFile(path)}
                  >
                    {busyPath === path ? 'Reverting…' : 'Revert this file'}
                  </button>
                </div>
              </details>
            );
          })}

          {summary.snapshotId ? (
            <button
              type="button"
              className="text-sm font-semibold text-blue-700 hover:underline"
              onClick={() => void onRestoreSnapshot(summary.snapshotId)}
            >
              Restore this version (DB snapshot)
            </button>
          ) : (
            <p className="text-gray-500">
              Snapshot not persisted (assign project + DATABASE_URL).
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
