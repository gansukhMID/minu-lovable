// Application Configuration
// This file contains all configurable settings for the application

export const appConfig = {
  // AI Model Configuration
  ai: {
    // Default AI model
    defaultModel: 'openai/gpt-5.4-nano-2026-03-17',
    
    // Available models
    availableModels: [
      'openai/gpt-5.4-nano-2026-03-17',
      'moonshotai/kimi-k2-instruct-0905',
      'anthropic/claude-sonnet-4-20250514',
      'google/gemini-3-pro-preview'
    ],
    
    // Model display names
    modelDisplayNames: {
      'openai/gpt-5.4-nano-2026-03-17': 'GPT-5.4 nano',
      'moonshotai/kimi-k2-instruct-0905': 'Kimi K2 (Groq)',
      'anthropic/claude-sonnet-4-20250514': 'Sonnet 4',
      'google/gemini-3-pro-preview': 'Gemini 3 Pro (Preview)'
    } as Record<string, string>,
    
    // Model API configuration
    modelApiConfig: {
      'moonshotai/kimi-k2-instruct-0905': {
        provider: 'groq',
        model: 'moonshotai/kimi-k2-instruct-0905'
      }
    },
    
    // Temperature settings for non-reasoning models
    defaultTemperature: 0.7,
    
    // Max tokens for code generation
    maxTokens: 8000,
    
    // Max tokens for truncation recovery (per-completion pass)
    truncationRecoveryMaxTokens: 4000,

    /** Fallback when primary provider exhausts retries (Groq outage, rate limits); OpenAIResponses model id without prefix */
    fallbackModelOpenAIId: 'gpt-4-turbo',

    /** Cheap model for chat vs code-change routing (Vercel AI Gateway string, e.g. openai/gpt-5.4-nano-… ) */
    routerModel: 'openai/gpt-5.4-nano-2026-03-17',

    /** Max output tokens for router generateObject (multi-step plans need headroom) */
    routerMaxTokens: 1600,

    /** Client fetch timeout for /api/route-intent (ms) */
    routerClientTimeoutMs: 15000,
  },
  
  // Code Application Configuration
  codeApplication: {
    // Delay after applying code before refreshing iframe (milliseconds)
    defaultRefreshDelay: 2000,
    
    // Delay when packages are installed (milliseconds)
    packageInstallRefreshDelay: 5000,
    
    // Enable/disable automatic truncation recovery (heuristic + targeted complete pass)
    enableTruncationRecovery: true,

    // Full scan + recovery passes over generated bundle (until clean or exhausted)
    maxTruncationRecoveryAttempts: 3,
  },
  
  // UI Configuration
  ui: {
    // Show/hide certain UI elements
    showModelSelector: true,
    showStatusIndicator: true,
    
    // Animation durations (milliseconds)
    animationDuration: 200,
    
    // Toast notification duration (milliseconds)
    toastDuration: 3000,
    
    // Maximum chat messages to keep in memory
    maxChatMessages: 100,
    
    // Maximum recent messages to send as context
    maxRecentMessagesContext: 20,
  },
  
  // Development Configuration
  dev: {
    // Enable debug logging
    enableDebugLogging: true,
    
    // Enable performance monitoring
    enablePerformanceMonitoring: false,
    
    // Log API responses
    logApiResponses: true,
  },
  
  // Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,
    
    // Package installation timeout (milliseconds)
    installTimeout: 60000,
    
    // Auto-restart Vite after package installation
    autoRestartVite: true,
  },
  
  // File Management Configuration
  files: {
    // Excluded file patterns (files to ignore)
    excludePatterns: [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '*.log',
      '.DS_Store'
    ],
    
    // Maximum file size to read (bytes)
    maxFileSize: 1024 * 1024, // 1MB
    
    // File extensions to treat as text
    textFileExtensions: [
      '.js', '.jsx', '.ts', '.tsx',
      '.css', '.scss', '.sass',
      '.html', '.xml', '.svg',
      '.json', '.yml', '.yaml',
      '.md', '.txt', '.env',
      '.gitignore', '.dockerignore'
    ],
  },
  
  // API Endpoints Configuration (for external services)
  api: {
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000, // milliseconds
    
    // Request timeout (milliseconds)
    requestTimeout: 30000,
  }
};

// Type-safe config getter
export function getConfig<K extends keyof typeof appConfig>(key: K): typeof appConfig[K] {
  return appConfig[key];
}

// Helper to get nested config values
export function getConfigValue(path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], appConfig as any);
}

export default appConfig;