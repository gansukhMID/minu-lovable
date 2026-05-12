import { NextRequest, NextResponse } from 'next/server'
import { sandboxManager } from '@/lib/sandbox/sandbox-manager'
import { SandboxFactory } from '@/lib/sandbox/factory'
import { E2BProvider } from '@/lib/sandbox/providers/e2b-provider'
import type { SandboxState } from '@/types/sandbox'

declare global {
  var activeSandboxProvider: any
  var sandboxData: any
  var existingFiles: Set<string>
  var sandboxState: SandboxState
}

// POST /api/resume-sandbox
// body: { sandboxId: string }
// Tries to reconnect to an existing sandbox. If dead, creates a new one.
export async function POST(request: NextRequest) {
  const { sandboxId } = await request.json() as { sandboxId: string }

  if (!sandboxId) {
    return NextResponse.json({ error: 'sandboxId required' }, { status: 400 })
  }

  // 1. Check in-memory manager first (fastest path)
  const existing = sandboxManager.getProvider(sandboxId)
  if (existing && existing.isAlive()) {
    const info = existing.getSandboxInfo()!
    console.log(`[resume-sandbox] Found live sandbox in memory: ${sandboxId}`)
    return NextResponse.json({
      success: true,
      resumed: true,
      sandboxId: info.sandboxId,
      url: info.url,
      provider: info.provider,
    })
  }

  // 2. Try provider-specific reconnect (E2B supports Sandbox.connect)
  const provider = SandboxFactory.create()
  if (provider instanceof E2BProvider) {
    console.log(`[resume-sandbox] Attempting E2B reconnect for ${sandboxId}`)
    const info = await provider.reconnect(sandboxId)
    if (info) {
      sandboxManager.registerSandbox(info.sandboxId, provider)
      global.activeSandboxProvider = provider
      global.sandboxData = { sandboxId: info.sandboxId, url: info.url }
      if (!global.existingFiles) global.existingFiles = new Set()
      return NextResponse.json({
        success: true,
        resumed: true,
        sandboxId: info.sandboxId,
        url: info.url,
        provider: info.provider,
      })
    }
  }

  // 3. Sandbox is dead — create a brand new one
  console.log(`[resume-sandbox] Sandbox ${sandboxId} is dead, creating new one`)
  try {
    await sandboxManager.terminateAll()
    if (global.activeSandboxProvider) {
      try { await global.activeSandboxProvider.terminate() } catch {}
      global.activeSandboxProvider = null
    }
    if (!global.existingFiles) global.existingFiles = new Set()
    else global.existingFiles.clear()

    const newProvider = SandboxFactory.create()
    const newInfo = await newProvider.createSandbox()
    await newProvider.setupViteApp()

    sandboxManager.registerSandbox(newInfo.sandboxId, newProvider)
    global.activeSandboxProvider = newProvider
    global.sandboxData = { sandboxId: newInfo.sandboxId, url: newInfo.url }
    global.sandboxState = {
      fileCache: { files: {}, lastSync: Date.now(), sandboxId: newInfo.sandboxId },
      sandbox: newProvider,
      sandboxData: { sandboxId: newInfo.sandboxId, url: newInfo.url },
    }

    return NextResponse.json({
      success: true,
      resumed: false,
      sandboxId: newInfo.sandboxId,
      url: newInfo.url,
      provider: newInfo.provider,
    })
  } catch (error) {
    console.error('[resume-sandbox] Failed to create new sandbox:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sandbox' },
      { status: 500 }
    )
  }
}
