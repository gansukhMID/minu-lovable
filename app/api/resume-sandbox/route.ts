import { NextRequest, NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { SandboxFactory } from '@/lib/sandbox/factory';
import { MinuProvider } from '@/lib/sandbox/providers/minu-provider';
import { hasReconnect } from '@/lib/sandbox/provider-capabilities';
import type { SandboxState } from '@/types/sandbox';

declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

// POST /api/resume-sandbox
// body: { sandboxId: string }
export async function POST(request: NextRequest) {
  const { sandboxId } = (await request.json()) as { sandboxId: string };

  if (!sandboxId) {
    return NextResponse.json({ error: 'sandboxId required' }, { status: 400 });
  }

  const existing = sandboxManager.getProvider(sandboxId);
  if (existing && existing.isAlive()) {
    const info = existing.getSandboxInfo()!;
    console.log(`[resume-sandbox] Found live sandbox in memory: ${sandboxId}`);
    return NextResponse.json({
      success: true,
      resumed: true,
      sandboxId: info.sandboxId,
      url: info.url,
      provider: info.provider,
    });
  }

  const provider = SandboxFactory.create();
  if (hasReconnect(provider)) {
    console.log(`[resume-sandbox] Attempting reconnect for ${sandboxId}`);
    const info = await provider.reconnect(sandboxId);
    if (info) {
      sandboxManager.registerSandbox(info.sandboxId, provider);
      global.activeSandboxProvider = provider;
      global.sandboxData = { sandboxId: info.sandboxId, url: info.url };
      if (!global.existingFiles) global.existingFiles = new Set();
      return NextResponse.json({
        success: true,
        resumed: true,
        sandboxId: info.sandboxId,
        url: info.url,
        provider: info.provider,
      });
    }
  }

  console.log(`[resume-sandbox] Sandbox ${sandboxId} is dead, creating new one`);
  try {
    await sandboxManager.terminateAll();
    if (global.activeSandboxProvider) {
      try {
        await global.activeSandboxProvider.terminate();
      } catch {}
      global.activeSandboxProvider = null;
    }
    if (!global.existingFiles) global.existingFiles = new Set();
    else global.existingFiles.clear();

    const newProvider = SandboxFactory.create();
    const newInfo = await newProvider.createSandbox();
    await newProvider.setupViteApp();
    const minuCreateResponse =
      newProvider instanceof MinuProvider ? newProvider.getLastCreateResponse() : null;

    sandboxManager.registerSandbox(newInfo.sandboxId, newProvider);
    global.activeSandboxProvider = newProvider;
    global.sandboxData = { sandboxId: newInfo.sandboxId, url: newInfo.url };
    global.sandboxState = {
      fileCache: { files: {}, lastSync: Date.now(), sandboxId: newInfo.sandboxId },
      sandbox: newProvider,
      sandboxData: { sandboxId: newInfo.sandboxId, url: newInfo.url },
    };

    return NextResponse.json({
      success: true,
      resumed: false,
      sandboxId: newInfo.sandboxId,
      url: newInfo.url,
      provider: newInfo.provider,
      ...(minuCreateResponse ?? {}),
    });
  } catch (error) {
    console.error('[resume-sandbox] Failed to create new sandbox:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sandbox' },
      { status: 500 }
    );
  }
}
