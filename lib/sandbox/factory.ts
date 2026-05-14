import { SandboxProvider, SandboxProviderConfig } from './types';
import { MinuProvider } from './providers/minu-provider';

/**
 * Add new sandbox backends here:
 * 1. Create `lib/sandbox/providers/<name>-provider.ts` extending SandboxProvider.
 * 2. Import it and add a `case` branch below.
 * 3. Extend `getAvailableProviders` / `isProviderAvailable` as needed.
 */
export class SandboxFactory {
  static create(provider?: string, config?: SandboxProviderConfig): SandboxProvider {
    const selectedProvider = provider || process.env.SANDBOX_PROVIDER || 'minu';

    switch (selectedProvider.toLowerCase()) {
      case 'minu':
        return new MinuProvider(config || {});

      default:
        throw new Error(
          `Unknown sandbox provider: "${selectedProvider}". ` +
            `Registered in SandboxFactory: ${SandboxFactory.getAvailableProviders().join(', ')}`
        );
    }
  }

  static getAvailableProviders(): string[] {
    return ['minu'];
  }

  static isProviderAvailable(provider: string): boolean {
    switch (provider.toLowerCase()) {
      case 'minu':
        return true;
      default:
        return false;
    }
  }
}
