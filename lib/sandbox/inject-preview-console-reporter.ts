import type { SandboxProvider } from '@/lib/sandbox/types';
import {
  getPreviewConsoleReporterInlineScript,
  PREVIEW_CONSOLE_REPORTER_MARKER,
} from '@/lib/sandbox/preview-console-reporter-inline';

/**
 * Patches sandbox index.html so the preview posts runtime errors / console.error
 * to the parent window via postMessage (parent verifies iframe origin against sandbox URL).
 */
export async function injectPreviewConsoleReporter(provider: SandboxProvider): Promise<boolean> {
  try {
    let html = '';
    const candidates = ['index.html', '/app/index.html'];
    for (const path of candidates) {
      try {
        html = await provider.readFile(path);
        break;
      } catch {
        // try next
      }
    }
    if (!html) {
      console.warn('[injectPreviewConsoleReporter] Could not read index.html');
      return false;
    }
    if (html.includes(PREVIEW_CONSOLE_REPORTER_MARKER)) return true;

    const script = `\n<script ${PREVIEW_CONSOLE_REPORTER_MARKER}>${getPreviewConsoleReporterInlineScript()}<\/script>`;

    let next: string;
    if (html.includes('</head>')) {
      next = html.replace('</head>', `${script}\n</head>`);
    } else if (html.includes('</HEAD>')) {
      next = html.replace('</HEAD>', `${script}\n</HEAD>`);
    } else {
      console.warn('[injectPreviewConsoleReporter] No </head> tag in index.html');
      return false;
    }

    try {
      await provider.writeFile('index.html', next);
      return true;
    } catch {
      try {
        await provider.writeFile('/app/index.html', next);
        return true;
      } catch (e2) {
        console.warn('[injectPreviewConsoleReporter] Write failed:', e2);
        return false;
      }
    }
  } catch (e) {
    console.warn('[injectPreviewConsoleReporter] Skipped:', e);
    return false;
  }
}
