import { NextRequest, NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { success: false, error: 'command (string) is required' },
        { status: 400 }
      );
    }

    const sandbox = global.activeSandboxProvider || global.activeSandbox;

    if (!sandbox) {
      return NextResponse.json({ success: false, error: 'No active sandbox' }, { status: 400 });
    }

    console.log(`[run-command] Executing: ${command}`);

    if (typeof sandbox.runCommand === 'function') {
      const r = await sandbox.runCommand(command);
      const stdout = typeof r.stdout === 'string' ? r.stdout : '';
      const stderr = typeof r.stderr === 'string' ? r.stderr : '';
      const exitCode = typeof r.exitCode === 'number' ? r.exitCode : r.success === false ? 1 : 0;
      const output = [stdout && `STDOUT:\n${stdout}`, stderr && `STDERR:\n${stderr}`, `Exit code: ${exitCode}`]
        .filter(Boolean)
        .join('\n');

      return NextResponse.json({
        success: exitCode === 0,
        output,
        exitCode,
        message:
          exitCode === 0
            ? 'Command executed successfully'
            : 'Command completed with non-zero exit code',
      });
    }

    return NextResponse.json(
      { success: false, error: 'Active sandbox does not support runCommand' },
      { status: 500 }
    );
  } catch (error) {
    console.error('[run-command] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
