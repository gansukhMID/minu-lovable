export interface SandboxFile {
  path: string;
  content: string;
  lastModified?: number;
}

/** Provider id string; extend when adding new SandboxFactory cases. */
export type SandboxProviderId = string;

export interface SandboxInfo {
  sandboxId: string;
  url: string;
  provider: SandboxProviderId;
  createdAt: Date;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/** Per-provider knobs; extend this when you add providers that need typed config. */
export interface SandboxProviderConfig {
  [key: string]: unknown;
}

export abstract class SandboxProvider {
  protected config: SandboxProviderConfig;
  protected sandbox: any;
  protected sandboxInfo: SandboxInfo | null = null;

  constructor(config: SandboxProviderConfig) {
    this.config = config;
  }

  abstract createSandbox(): Promise<SandboxInfo>;
  abstract runCommand(command: string): Promise<CommandResult>;
  abstract writeFile(path: string, content: string): Promise<void>;
  abstract readFile(path: string): Promise<string>;
  abstract listFiles(directory?: string): Promise<string[]>;
  abstract installPackages(packages: string[]): Promise<CommandResult>;
  abstract getSandboxUrl(): string | null;
  abstract getSandboxInfo(): SandboxInfo | null;
  abstract terminate(): Promise<void>;
  abstract isAlive(): boolean;

  async setupViteApp(): Promise<void> {
    throw new Error('setupViteApp not implemented for this provider');
  }

  async restartViteServer(): Promise<void> {
    throw new Error('restartViteServer not implemented for this provider');
  }
}
