import { SandboxProvider, SandboxInfo, SandboxProviderConfig, CommandResult } from '../types';

export class MinuProvider extends SandboxProvider {
  private static readonly DEFAULT_VITE_TEMPLATE = 'react-ts';
  private static readonly DEFAULT_IMAGE = 'node:20-bookworm';

  private sessionId: string | null = null;
  private containerId: string | null = null;
  private sandboxPort: number | null = null;
  private baseUrl: string;
  private alive: boolean = false;
  private lastCreateResponse: {
    sessionid: string;
    tag: string;
    vite_template: string;
    container: string;
  } | null = null;

  constructor(config: SandboxProviderConfig) {
    super(config);
    this.baseUrl = process.env.MINU_SANDBOX_URL || 'http://192.168.110.93:8080';
  }

  private parseSession(sessionId: string): { containerId: string; port: number } {
    const parts = sessionId.split('-');
    const portMatch = sessionId.match(/(\d{2,5})(?!.*\d)/);
    const port = Number(portMatch?.[1]);
    const containerId = parts.slice(0, -1).join('-');
    return { containerId, port };
  }

  async createSandbox(): Promise<SandboxInfo> {
    const payload = {
      vite_template: MinuProvider.DEFAULT_VITE_TEMPLATE,
      image: MinuProvider.DEFAULT_IMAGE,
    };
    console.log('[MinuProvider] createSandbox request payload:', payload);

    const res = await fetch(`${this.baseUrl}/docker/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[MinuProvider] createSandbox failed: ${res.status} ${text}`);
    }

    const data = await res.json() as {
      sessionid: string;
      tag: string;
      vite_template: string;
      container: string;
    };
    const { port } = this.parseSession(data.sessionid);
    if (!Number.isFinite(port)) {
      throw new Error(`[MinuProvider] Unable to parse port from sessionid: ${data.sessionid}`);
    }
    this.lastCreateResponse = data;

    this.sessionId = data.sessionid;
    this.containerId = data.container;
    this.sandboxPort = port;
    this.alive = true;

    const host = process.env.MINU_SANDBOX_HOST || '192.168.110.93';
    const url = `http://${host}:${port}`;

    this.sandboxInfo = {
      sandboxId: data.sessionid,
      url,
      provider: 'minu',
      createdAt: new Date(),
    };

    console.log(`[MinuProvider] Created sandbox: ${data.sessionid} → ${url}`);
    return this.sandboxInfo;
  }

  getLastCreateResponse(): {
    sessionid: string;
    tag: string;
    vite_template: string;
    container: string;
  } | null {
    return this.lastCreateResponse;
  }

  async reconnect(sandboxId: string): Promise<SandboxInfo | null> {
    try {
      const { containerId, port } = this.parseSession(sandboxId);

      const res = await fetch(`${this.baseUrl}/containers/${containerId}/info`);
      if (!res.ok) return null;

      const data = await res.json() as { container: { status: string } };
      if (data.container?.status !== 'running') return null;

      this.sessionId = sandboxId;
      this.containerId = containerId;
      this.sandboxPort = port;
      this.alive = true;

      const host = process.env.MINU_SANDBOX_HOST || '192.168.110.93';
      const url = `http://${host}:${port}`;

      this.sandboxInfo = {
        sandboxId,
        url,
        provider: 'minu',
        createdAt: new Date(),
      };

      console.log(`[MinuProvider] Reconnected to sandbox: ${sandboxId}`);
      return this.sandboxInfo;
    } catch (e) {
      console.error('[MinuProvider] reconnect failed:', e);
      return null;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.containerId) throw new Error('[MinuProvider] No active container');

    const res = await fetch(`${this.baseUrl}/containers/${this.containerId}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, workdir: '/app', timeout: 60 }),
    });

    const data = await res.json() as {
      output?: string;
      exit_code?: number;
      success: boolean;
      error?: string;
    };

    return {
      stdout: data.output || '',
      stderr: data.error || '',
      exitCode: data.exit_code ?? (data.success ? 0 : 1),
      success: data.success,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sessionId) throw new Error('[MinuProvider] No active session');

    const res = await fetch(`${this.baseUrl}/files/put/${this.sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: path, content }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[MinuProvider] writeFile failed for ${path}: ${res.status} ${text}`);
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.sessionId) throw new Error('[MinuProvider] No active session');

    const res = await fetch(`${this.baseUrl}/files/get/${this.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: path }),
    });

    if (!res.ok) throw new Error(`[MinuProvider] readFile failed for ${path}: ${res.status}`);

    const data = await res.json() as { content: string };
    return data.content;
  }

  async listFiles(directory?: string): Promise<string[]> {
    if (!this.sessionId) throw new Error('[MinuProvider] No active session');

    const res = await fetch(`${this.baseUrl}/files/list/${this.sessionId}`);
    if (!res.ok) throw new Error(`[MinuProvider] listFiles failed: ${res.status}`);

    const data = await res.json() as { files: Array<{ path: string }> };
    const paths = (data.files || []).map(f => f.path);

    if (directory) {
      const prefix = directory.endsWith('/') ? directory : directory + '/';
      return paths.filter(p => p.startsWith(prefix));
    }

    return paths;
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (packages.length === 0) {
      return { stdout: '', stderr: '', exitCode: 0, success: true };
    }
    return this.runCommand(`npm install ${packages.join(' ')}`);
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    const cid = this.containerId;
    if (cid) {
      try {
        const res = await fetch(`${this.baseUrl}/containers/${cid}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          console.warn('[MinuProvider] Remote terminate returned', res.status, await res.text());
        }
      } catch (e) {
        console.warn('[MinuProvider] Remote container delete failed (ignored):', e);
      }
    }
    this.alive = false;
    this.sessionId = null;
    this.containerId = null;
    this.sandboxPort = null;
    this.lastCreateResponse = null;
    this.sandboxInfo = null;
  }

  isAlive(): boolean {
    return this.alive && this.containerId !== null;
  }

  async setupViteApp(): Promise<void> {
    // Template already has the app set up — just ensure dev server is running
    const check = await this.runCommand('pgrep -f "vite" || echo "not running"');
    if (check.stdout.includes('not running')) {
      console.log('[MinuProvider] Starting dev server...');
      await this.runCommand('nohup npm run dev > /tmp/vite.log 2>&1 &');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  async restartViteServer(): Promise<void> {
    await this.runCommand('pkill -f vite || true');
    await new Promise(r => setTimeout(r, 500));
    await this.runCommand('nohup npm run dev > /tmp/vite.log 2>&1 &');
    await new Promise(r => setTimeout(r, 2000));
  }
}
