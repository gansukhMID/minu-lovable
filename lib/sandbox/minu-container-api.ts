/**
 * Minu sandbox Docker HTTP API (/containers/...).
 * @see POST .../stop, POST .../start, DELETE ... (optional query remove_session_files).
 */

const DEFAULT_TIMEOUT_SEC = 10;

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

/** Session id (e.g. from docker/create) → API container id + published port. */
export function parseMinuSandboxSessionId(sessionId: string): { containerId: string; port: number } {
  const portMatch = sessionId.match(/(\d{2,5})(?!.*\d)/);
  const port = Number(portMatch?.[1]);
  const parts = sessionId.split('-');
  const containerId = parts.slice(0, -1).join('-');
  return { containerId, port };
}

/**
 * Minu DELETE/stop/start paths use the Docker manager's container id.
 * DB `sandbox_id` is usually `sessionid` (…-<port>) but may be the raw `container` from /docker/create.
 * If parsing yields a plausible session (trailing port + non-empty prefix), use the prefix; else use the full string.
 */
export function resolveMinuContainerIdForApi(storedSandboxKey: string): string {
  const s = storedSandboxKey.trim();
  if (!s) return s;
  const { containerId, port } = parseMinuSandboxSessionId(s);
  const looksLikeSessionWithPort =
    Number.isFinite(port) && port >= 10 && port <= 65535 && containerId.length > 0;
  if (looksLikeSessionWithPort) {
    return containerId;
  }
  return s;
}

export type MinuContainerOpResult = {
  skipped?: boolean;
  [key: string]: unknown;
};

async function readJsonBody(res: Response): Promise<MinuContainerOpResult> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as MinuContainerOpResult;
  } catch {
    return { raw: text };
  }
}

function okOrLog(res: Response, text: string, op: string): void {
  if (!res.ok && res.status !== 404) {
    throw new Error(`[Minu] ${op} failed: ${res.status} ${text}`);
  }
}

/** POST /containers/:id/stop — optional JSON { timeout } (seconds), default 10. */
export async function minuContainerStop(
  baseUrl: string,
  containerId: string,
  options?: { timeout?: number },
): Promise<MinuContainerOpResult> {
  const url = `${trimBase(baseUrl)}/containers/${encodeURIComponent(containerId)}/stop`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeout: options?.timeout ?? DEFAULT_TIMEOUT_SEC }),
  });
  const data = await readJsonBody(res);
  okOrLog(res, JSON.stringify(data), 'stop');
  return data;
}

/** POST /containers/:id/start */
export async function minuContainerStart(baseUrl: string, containerId: string): Promise<MinuContainerOpResult> {
  const url = `${trimBase(baseUrl)}/containers/${encodeURIComponent(containerId)}/start`;
  const res = await fetch(url, { method: 'POST' });
  const data = await readJsonBody(res);
  okOrLog(res, JSON.stringify(data), 'start');
  return data;
}

export type MinuContainerDeleteOptions = {
  /** Stop wait before rm (seconds). Default 10. */
  timeout?: number;
  /**
   * false: query remove_session_files=false — only remove container, keep session dirs.
   * undefined/true: default server behavior (remove sessions/<key>/ workspace + .docker-mgr).
   */
  removeSessionFiles?: boolean;
};

/** DELETE /containers/:id — stop, docker rm -f; optional JSON { timeout }. */
export async function minuContainerDelete(
  baseUrl: string,
  containerId: string,
  options?: MinuContainerDeleteOptions,
): Promise<MinuContainerOpResult> {
  const u = new URL(`${trimBase(baseUrl)}/containers/${encodeURIComponent(containerId)}`);
  if (options?.removeSessionFiles === false) {
    u.searchParams.set('remove_session_files', 'false');
  }
  const res = await fetch(u.toString(), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeout: options?.timeout ?? DEFAULT_TIMEOUT_SEC }),
  });
  const data = await readJsonBody(res);
  okOrLog(res, JSON.stringify(data), 'delete');
  return data;
}

/**
 * Same as {@link minuContainerDelete} but accepts DB `sandbox_id` (session id or raw container id).
 * Tries resolved id first; on 404 tries the full stored key before giving up.
 */
export async function minuContainerDeleteForStoredSandboxKey(
  baseUrl: string,
  storedSandboxKey: string,
  options?: MinuContainerDeleteOptions,
): Promise<MinuContainerOpResult> {
  const trimmed = storedSandboxKey.trim();
  if (!trimmed) return {};
  const resolved = resolveMinuContainerIdForApi(trimmed);
  const candidates = [...new Set([resolved, trimmed].filter(Boolean))];

  let lastData: MinuContainerOpResult = {};
  for (let i = 0; i < candidates.length; i++) {
    const containerId = candidates[i];
    const u = new URL(`${trimBase(baseUrl)}/containers/${encodeURIComponent(containerId)}`);
    if (options?.removeSessionFiles === false) {
      u.searchParams.set('remove_session_files', 'false');
    }
    const res = await fetch(u.toString(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: options?.timeout ?? DEFAULT_TIMEOUT_SEC }),
    });
    lastData = await readJsonBody(res);
    if (res.ok) return lastData;
    if (res.status === 404) continue;
    const isLast = i === candidates.length - 1;
    if (!isLast) continue;
    okOrLog(res, JSON.stringify(lastData), 'delete');
  }
  return lastData;
}

export function getMinuSandboxBaseUrl(): string {
  return process.env.MINU_SANDBOX_URL || 'http://192.168.110.93:8080';
}
