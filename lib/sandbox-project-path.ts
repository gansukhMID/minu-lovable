/**
 * Sandbox / LLM output sometimes contains nested Linux paths like
 * /home/user/app/src/home/user/app/src/foo.css. Normalise to a single
 * project-relative path (src/..., public/..., package.json, …) for writes
 * and manifest keys.
 */

export function canonicalProjectRelativePath(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let p = raw.replace(/\\/g, '/').trim();
  if (!p || p === '.') return '';

  while (p.startsWith('/')) p = p.slice(1);
  while (p.startsWith('./')) p = p.slice(2);

  for (let i = 0; i < 32; i++) {
    const before = p;
    p = p.replace(/(^|\/)home\/user\/app\//g, '$1');
    p = p.replace(/(^|\/)workspace\//g, '$1');
    if (p.startsWith('app/')) p = p.slice(4);
    p = p.replace(/\/+/g, '/');
    while (p.startsWith('/')) p = p.slice(1);
    if (p === before) break;
  }

  // Model sometimes echoes duplicated project roots (e.g. src/src/src/style.css).
  while (p.startsWith('src/src/')) p = p.slice(4);
  while (p.startsWith('public/public/')) p = p.slice(7);

  return p;
}

/** Manifest + getFileContents use keys like `/src/App.jsx`. */
export function manifestFileKey(raw: string): string {
  const rel = canonicalProjectRelativePath(raw);
  if (!rel) return '';
  return `/${rel}`;
}
