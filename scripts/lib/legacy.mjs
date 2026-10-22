// Shared helpers for reading the legacy static site.
// Legacy files are a mix of UTF-8 and Windows-1252; always read them through `readLegacy`.
import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const LEGACY = path.join(ROOT, 'legacy');

// Git Bash (MSYS) on Windows rewrites arguments that look like POSIX paths before running a
// native program: `/about/board` arrives as `C:/Program Files/Git/about/board`. Undo that
// for route arguments. Set MSYS_NO_PATHCONV=1 to avoid it at the source.
const MSYS_ROOT = /^[A-Za-z]:[\\/](?:[^\\/]+[\\/])*?Git(?=[\\/]|$)/i;
export const unmangleRoute = (arg) =>
  process.platform === 'win32' && MSYS_ROOT.test(arg)
    ? arg.replace(MSYS_ROOT, '').replace(/\\/g, '/') || '/'
    : arg;

/** process.argv.slice(2) with MSYS-mangled route arguments restored. */
export const cliArgs = () => process.argv.slice(2).map(unmangleRoute);

/** Read a legacy file, decoding UTF-8 if valid, otherwise Windows-1252. */
export function readLegacy(file) {
  const buf = fs.readFileSync(file);
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' };
  return { text: iconv.decode(buf, 'win1252'), encoding: 'windows-1252' };
}

/** Path relative to legacy/ with forward slashes on every OS (`about/sota.html`). */
export const legacyRel = (abs) => path.relative(LEGACY, abs).replace(/\\/g, '/');

/** All legacy HTML pages (excluding includes/), as forward-slash paths relative to legacy/. */
export function legacyPages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['includes', 'images', 'pdf'].includes(e.name)) walk(p);
      } else if (e.name.endsWith('.html')) out.push(legacyRel(p));
    }
  };
  walk(LEGACY);
  return out.sort();
}

/** Map a legacy file path to the URL it is served at. `about/index.html` -> `/about/`, `about/sota.html` -> `/about/sota`. */
export function legacyFileToRoute(rel) {
  const r = rel.replace(/\\/g, '/');
  if (r === 'index.html') return '/';
  if (r.endsWith('/index.html')) return '/' + r.slice(0, -'index.html'.length);
  return '/' + r.replace(/\.html$/, '');
}

/** Resolve a URL path to a legacy file (handles extensionless and directory URLs). */
export function routeToLegacyFile(route) {
  const clean = decodeURIComponent(route.split(/[?#]/)[0]).replace(/^\/+/, '');
  const cands = [clean, `${clean}.html`, path.join(clean, 'index.html')];
  for (const c of cands) {
    const p = path.join(LEGACY, c);
    if (p.startsWith(LEGACY) && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
