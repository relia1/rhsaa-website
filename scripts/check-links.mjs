#!/usr/bin/env node
// Post-build checks on dist/:
//  1. Every internal href/src in built HTML resolves to a built file or a configured redirect.
//     Links to legacy routes the tracker still lists as todo/in-progress are reported as pending
//     (the header links to every section long before every page is migrated), not as failures.
//  2. Every legacy route marked migrated/verified in migration/status.json is built (or redirected).
//  3. Unlisted pages (src/config/unlisted.mjs) are noindex, linked from no listed page, and absent
//     from the sitemap. Unlisted pages may link to each other as legacy did (owner decision
//     2026-10-20); redirect stubs don't count as linking pages.
//  4. Warns about optimised images heavier than IMAGE_WARN_KB.
// Exits non-zero on failure. Run after `astro build` (part of `bun run verify`).
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { ROOT } from './lib/legacy.mjs';
import { legacyRedirects } from '../src/config/redirects.mjs';
import { unlistedRoutes } from '../src/config/unlisted.mjs';

const DIST = path.join(ROOT, 'dist');
const IMAGE_WARN_KB = 600;
if (!fs.existsSync(DIST)) {
  console.error('dist/ not found. Run `bun run build` first.');
  process.exit(1);
}

const htmlFiles = [];
const imageFiles = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
    else if (/\.(avif|webp|jpe?g|png|gif)$/i.test(e.name)) imageFiles.push(p);
  }
};
walk(DIST);
const rel = (p) => path.relative(DIST, p).replace(/\\/g, '/');
const trim = (p) => p.replace(/\/$/, '') || '/';

// Tracker: routes not migrated yet, and routes that must be built.
const statusFile = path.join(ROOT, 'migration/status.json');
const status = fs.existsSync(statusFile)
  ? JSON.parse(fs.readFileSync(statusFile, 'utf8'))
  : { routes: {} };
const pendingRoutes = new Set();
for (const [legacyRoute, s] of Object.entries(status.routes ?? {}))
  if (['todo', 'in-progress'].includes(s.status)) {
    pendingRoutes.add(trim(legacyRoute));
    pendingRoutes.add(trim(s.target ?? legacyRoute));
  }

const redirectKeys = new Set(Object.keys(legacyRedirects).map(trim));
function exists(urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (redirectKeys.has(trim(clean))) return true;
  const r = clean.replace(/^\/+/, '');
  return [r, path.join(r, 'index.html'), `${r}.html`].some((c) => {
    const p = path.join(DIST, c);
    return fs.existsSync(p) && fs.statSync(p).isFile();
  });
}

// URL a built file is served at: about/index.html -> /about/, about/sota.html -> /about/sota.
const routeOf = (file) => {
  const r = rel(file);
  if (r === 'index.html') return '/';
  if (r.endsWith('/index.html')) return '/' + r.slice(0, -'index.html'.length);
  return '/' + r.replace(/\.html$/, '');
};

const failures = [];
const pendingLinks = new Set();
const inbound = new Map(); // target route -> Set of source routes
const robots = new Map(); // route -> meta robots content
for (const file of htmlFiles) {
  const route = routeOf(file);
  const base = `https://site.local${route}`;
  const root = parse(fs.readFileSync(file, 'utf8'));
  robots.set(trim(route), root.querySelector('meta[name=robots]')?.getAttribute('content') ?? '');
  // Astro's static redirect stubs (meta refresh) aren't pages anyone browses to.
  const isRedirectStub = Boolean(root.querySelector('meta[http-equiv=refresh]'));
  if (!isRedirectStub)
    for (const a of root.querySelectorAll('a[href]')) {
      const v = a.getAttribute('href');
      if (!v || /^(https?:|\/\/|mailto:|tel:|javascript:|#)/i.test(v)) continue;
      const t = trim(new URL(v, base).pathname);
      if (t === trim(route)) continue;
      if (!inbound.has(t)) inbound.set(t, new Set());
      inbound.get(t).add(trim(route));
    }
  for (const n of root.querySelectorAll(
    'a[href], img[src], link[href], script[src], source[src], source[srcset], img[srcset]',
  )) {
    const vals = [
      n.getAttribute('href'),
      n.getAttribute('src'),
      ...(n.getAttribute('srcset') ?? '').split(',').map((s) => s.trim().split(' ')[0]),
    ];
    for (const v of vals) {
      if (!v || /^(https?:|\/\/|mailto:|tel:|data:|javascript:|#)/i.test(v)) continue;
      const p = new URL(v, base).pathname;
      if (exists(p)) continue;
      if (pendingRoutes.has(trim(decodeURIComponent(p)))) pendingLinks.add(trim(p));
      else failures.push(`${rel(file)} -> ${v}`);
    }
  }
}

const missingRoutes = [];
const notMigrated = [];
for (const [legacyRoute, s] of Object.entries(status.routes ?? {})) {
  const target = s.target ?? legacyRoute;
  if (['migrated', 'verified'].includes(s.status)) {
    if (!exists(target))
      missingRoutes.push(`${legacyRoute} (target ${target}) is marked ${s.status} but not built`);
    if (trim(target) !== trim(legacyRoute) && !exists(legacyRoute))
      missingRoutes.push(`${legacyRoute} moved to ${target} but has no redirect`);
  } else if (s.status !== 'dropped') notMigrated.push(legacyRoute);
}

const unlistedProblems = [];
const sitemap = fs
  .readdirSync(DIST)
  .filter((f) => /^sitemap.*\.xml$/.test(f))
  .map((f) => fs.readFileSync(path.join(DIST, f), 'utf8'))
  .join('\n');
for (const u of unlistedRoutes) {
  if (!robots.has(u)) continue; // not built yet
  if (!/noindex/i.test(robots.get(u)))
    unlistedProblems.push(`${u} is unlisted but has no <meta name="robots" content="noindex">`);
  for (const src of inbound.get(u) ?? [])
    if (!unlistedRoutes.includes(src))
      unlistedProblems.push(`${u} is unlisted but linked from listed page ${src}`);
  if (
    sitemap.includes(`<loc>https://`) &&
    new RegExp(`<loc>[^<]*${u.replace(/[/]/g, '\\/')}/?</loc>`).test(sitemap)
  )
    unlistedProblems.push(`${u} is unlisted but in the sitemap`);
}

const heavy = imageFiles
  .map((f) => ({ f: rel(f), kb: Math.round(fs.statSync(f).size / 1024) }))
  .filter((i) => i.kb > IMAGE_WARN_KB)
  .sort((a, b) => b.kb - a.kb);

console.log(`checked ${htmlFiles.length} built pages`);
if (notMigrated.length) console.log(`legacy routes not yet migrated: ${notMigrated.length}`);
if (pendingLinks.size)
  console.log(
    `links to routes not migrated yet (OK until they are): ${pendingLinks.size} — ${[...pendingLinks].sort().join(', ')}`,
  );
if (heavy.length) {
  console.warn(
    `\nWarning: ${heavy.length} built image(s) over ${IMAGE_WARN_KB} KB — check widths/sizes:`,
  );
  heavy.slice(0, 15).forEach((i) => console.warn(`  ${i.f} (${i.kb} KB)`));
}
if (failures.length) {
  console.error(`\nBroken internal references (${failures.length}):`);
  failures.forEach((f) => console.error(`  ${f}`));
}
if (missingRoutes.length) {
  console.error(`\nRoute coverage problems (${missingRoutes.length}):`);
  missingRoutes.forEach((f) => console.error(`  ${f}`));
}
if (unlistedProblems.length) {
  console.error(`\nUnlisted page problems (${unlistedProblems.length}):`);
  unlistedProblems.forEach((f) => console.error(`  ${f}`));
}
process.exit(failures.length || missingRoutes.length || unlistedProblems.length ? 1 : 0);
