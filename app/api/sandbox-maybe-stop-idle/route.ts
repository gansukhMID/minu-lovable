import { NextResponse } from 'next/server';

declare global {
  var activeSandboxProvider: any;
  var existingFiles: Set<string>;
  var lastSandboxActivityAt: number | undefined;
}

/** Optional idle shutdown (call from cron). Set SANDBOX_IDLE_SHUTDOWN_MS (default 30m). */
export async function POST() {
  const maxMs = Number(process.env.SANDBOX_IDLE_SHUTDOWN_MS ?? `${30 * 60 * 1000}`) || 1_800_000;
  const last = globalThis.lastSandboxActivityAt;
  if (last == null || Date.now() - last < maxMs) {
    return NextResponse.json({
      stopped: false,
      reason: 'within idle window or no activity recorded',
      last,
      maxMs,
    });
  }

  const provider = global.activeSandboxProvider;
  try {
    if (provider?.terminate) {
      await provider.terminate();
    }
  } catch (e) {
    console.warn('[sandbox-maybe-stop-idle] terminate error', e);
  }
  global.activeSandboxProvider = null;
  if (global.existingFiles?.clear) global.existingFiles.clear();

  return NextResponse.json({ stopped: true, maxMs, last });
}
