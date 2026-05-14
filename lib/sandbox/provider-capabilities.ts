import type { SandboxProvider, SandboxInfo } from './types';

/** Providers that support `reconnect(sandboxId)` (optional extension point). */
export type SandboxProviderWithReconnect = SandboxProvider & {
  reconnect(sandboxId: string): Promise<SandboxInfo | null>;
};

export function hasReconnect(provider: SandboxProvider): provider is SandboxProviderWithReconnect {
  return typeof (provider as SandboxProviderWithReconnect).reconnect === 'function';
}
