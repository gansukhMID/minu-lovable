import { NextResponse } from 'next/server';
import { SandboxFactory } from '@/lib/sandbox/factory';
import type { SandboxState } from '@/types/sandbox';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { injectPreviewConsoleReporter } from '@/lib/sandbox/inject-preview-console-reporter';
import { MinuProvider } from '@/lib/sandbox/providers/minu-provider';

declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
  var lastSandboxActivityAt: number | undefined;
}

/**
 * Lightweight pre-warm: create sandbox only when none alive (does NOT terminate existing).
 */
export async function POST() {
  try {
    if (global.activeSandboxProvider?.isAlive?.()) {
      const info = global.activeSandboxProvider.getSandboxInfo?.();
      return NextResponse.json({
        success: true,
        skipped: true,
        sandboxId: info?.sandboxId,
        url: info?.url,
      });
    }

    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    }

    const provider = SandboxFactory.create();
    const sandboxInfo = await provider.createSandbox();
    await provider.setupViteApp();
    await injectPreviewConsoleReporter(provider);

    sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);
    global.activeSandboxProvider = provider;
    global.sandboxData = {
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
    };

    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId: sandboxInfo.sandboxId,
      },
      sandbox: provider,
      sandboxData: {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url,
      },
    };

    const minuCreateResponse = provider instanceof MinuProvider ? provider.getLastCreateResponse() : null;

    globalThis.lastSandboxActivityAt = Date.now();

    return NextResponse.json({
      success: true,
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
      provider: sandboxInfo.provider,
      message: 'Prewarmed sandbox ready',
      ...(minuCreateResponse ?? {}),
    });
  } catch (error) {
    console.error('[sandbox-prewarm] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prewarm failed' },
      { status: 500 }
    );
  }
}
