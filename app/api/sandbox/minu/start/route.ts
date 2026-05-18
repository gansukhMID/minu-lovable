import { NextRequest, NextResponse } from 'next/server';
import {
  getMinuSandboxBaseUrl,
  minuContainerStart,
  resolveMinuContainerIdForApi,
} from '@/lib/sandbox/minu-container-api';
import { MinuProvider } from '@/lib/sandbox/providers/minu-provider';

export async function POST(req: NextRequest) {
  let body: { sandboxId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const sandboxId = body.sandboxId?.trim();
  if (!sandboxId) {
    return NextResponse.json({ error: 'sandboxId is required' }, { status: 400 });
  }

  try {
    const p = global.activeSandboxProvider;
    if (p instanceof MinuProvider && p.getSandboxInfo()?.sandboxId === sandboxId) {
      await p.startDocker();
    } else {
      const containerId = resolveMinuContainerIdForApi(sandboxId);
      await minuContainerStart(getMinuSandboxBaseUrl(), containerId);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sandbox/minu/start]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
