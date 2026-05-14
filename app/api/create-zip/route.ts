import { NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

function getActiveSandbox(): { runCommand: (cmd: string) => Promise<{ stdout?: string; stderr?: string; exitCode?: number; success?: boolean }> } | null {
  const s = global.activeSandboxProvider || global.activeSandbox;
  if (!s || typeof s.runCommand !== 'function') return null;
  return s;
}

export async function POST() {
  try {
    const sandbox = getActiveSandbox();
    if (!sandbox) {
      return NextResponse.json({ success: false, error: 'No active sandbox' }, { status: 400 });
    }

    console.log('[create-zip] Creating project zip...');

    const zipResult = await sandbox.runCommand(
      `zip -r /tmp/project.zip . -x "node_modules/*" ".git/*" ".next/*" "dist/*" "build/*" "*.log"`
    );

    const zipRc =
      zipResult.exitCode !== undefined ? zipResult.exitCode : zipResult.success === false ? 1 : 0;
    if (zipRc !== 0) {
      throw new Error(`Failed to create zip: ${zipResult.stderr || zipResult.stdout || ''}`);
    }

    const sizeResult = await sandbox.runCommand(`ls -la /tmp/project.zip | awk '{print $5}'`);
    const fileSize = (sizeResult.stdout || '').trim();
    console.log(`[create-zip] Created project.zip (${fileSize || '?'} bytes)`);

    const readResult = await sandbox.runCommand(`base64 /tmp/project.zip`);

    const readRc =
      readResult.exitCode !== undefined ? readResult.exitCode : readResult.success === false ? 1 : 0;
    if (readRc !== 0) {
      throw new Error(`Failed to read zip file: ${readResult.stderr || ''}`);
    }

    const base64Content = (readResult.stdout || '').trim();

    const dataUrl = `data:application/zip;base64,${base64Content}`;

    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: 'sandbox-project.zip',
      message: 'Zip file created successfully',
    });
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
