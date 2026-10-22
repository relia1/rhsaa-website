#!/usr/bin/env node
// Audit the legacy site and write migration/legacy-audit.json:
// every page (route, title, encoding, hero, images, embeds, forms, outbound links),
// plus broken references, orphan pages and unreferenced assets.
// Re-run whenever legacy/ changes. Agents read the JSON instead of re-crawling HTML.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import {
  LEGACY,
  ROOT,
  readLegacy,
  legacyPages,
  legacyRel,
  legacyFileToRoute,
  routeToLegacyFile,
} from './lib/legacy.mjs';

const pages = legacyPages();
const assets = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else assets.push({ path: '/' + legacyRel(p), bytes: fs.statSync(p).size });
  }
};
['images', 'pdf'].forEach((d) => walk(path.join(LEGACY, d)));
const assetSet = new Set(assets.map((a) => a.path));

const refCount = new Map();
const inbound = new Map(pages.map((p) => [legacyFileToRoute(p), 0]));
const broken = [];
const isExternal = (u) => /^(https?:|\/\/|mailto:|tel:|javascript:|#)/i.test(u);

function resolve(u, fromRoute) {
  return new URL(u, new URL(fromRoute, 'https://legacy.local')).pathname;
}
function track(u, fromRoute, fromFile) {
  if (!u || isExternal(u)) return;
  const p = decodeURIComponent(resolve(u, fromRoute));
  if (assetSet.has(p)) return refCount.set(p, (refCount.get(p) ?? 0) + 1);
  const f = routeToLegacyFile(p);
  if (f && f.endsWith('.html')) {
    const r = legacyFileToRoute(legacyRel(f));
    if (r !== fromRoute) inbound.set(r, (inbound.get(r) ?? 0) + 1);
    return;
  }
  if (f) return;
  broken.push({ from: fromFile, ref: u, resolved: p });
}

// Shared includes count as linking from every page.
for (const inc of ['includes/header.html', 'includes/footer.html']) {
  const root = parse(readLegacy(path.join(LEGACY, inc)).text);
  root
    .querySelectorAll('[href],[src]')
    .forEach((n) => track(n.getAttribute('href') ?? n.getAttribute('src'), '/', inc));
}
const css = readLegacy(path.join(LEGACY, 'includes/rhsaa-style.css')).text;
const heroes = {};
for (const m of css.matchAll(/\.(photo[a-z]+)\s*\{\s*background-image:\s*url\("?([^")]+)"?\)/g)) {
  heroes[m[1]] = resolve(m[2], '/includes/');
  track(m[2], '/includes/', 'includes/rhsaa-style.css');
}
for (const m of css.matchAll(/url\("?([^")]+)"?\)/g))
  if (!/photo/.test(m[0])) track(m[1], '/includes/', 'includes/rhsaa-style.css');

const pageRecords = pages.map((rel) => {
  const route = legacyFileToRoute(rel);
  const { text, encoding } = readLegacy(path.join(LEGACY, rel));
  const root = parse(text);
  root
    .querySelectorAll('[href],[src]')
    .forEach((n) => track(n.getAttribute('href') ?? n.getAttribute('src'), route, rel));
  const main = root.querySelector('.main') ?? root;
  const heroClass =
    main
      .querySelector('[class*=photo]')
      ?.getAttribute('class')
      ?.match(/\bphoto[a-z]+\b/)?.[0] ?? null;
  return {
    route,
    file: `legacy/${rel}`,
    title: root.querySelector('title')?.text.trim() || null,
    encoding,
    words: main.text.split(/\s+/).filter(Boolean).length,
    hero: heroClass
      ? {
          class: heroClass,
          image: heroes[heroClass] ?? null,
          title: main.querySelector('.photot')?.text.trim() ?? null,
        }
      : null,
    images: [
      ...new Set(
        main.querySelectorAll('img').map((i) => resolve(i.getAttribute('src') ?? '', route)),
      ),
    ],
    pdfs: [
      ...new Set(
        main.querySelectorAll('a[href$=".pdf"]').map((a) => resolve(a.getAttribute('href'), route)),
      ),
    ],
    embeds: [
      ...main
        .querySelectorAll('iframe')
        .map((i) => ({ kind: 'iframe', src: i.getAttribute('src') })),
      ...main
        .querySelectorAll('script[src]')
        .map((s) => ({ kind: 'script', src: s.getAttribute('src') })),
    ],
    forms: main
      .querySelectorAll('form')
      .map((f) => ({ action: f.getAttribute('action'), method: f.getAttribute('method') })),
    externalLinks: [
      ...new Set(
        main
          .querySelectorAll('a[href]')
          .map((a) => a.getAttribute('href'))
          .filter((h) => /^https?:|^\/\//.test(h)),
      ),
    ],
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    pages: pages.length,
    nonUtf8Pages: pageRecords.filter((p) => p.encoding !== 'utf-8').length,
    assets: assets.length,
    assetBytes: assets.reduce((a, b) => a + b.bytes, 0),
    brokenRefs: broken.length,
  },
  pages: pageRecords,
  heroes,
  brokenRefs: broken,
  orphanPages: [...inbound].filter(([r, n]) => n === 0 && r !== '/').map(([r]) => r),
  unreferencedAssets: assets.filter((a) => !refCount.get(a.path)).map((a) => a.path),
  oversizedAssets: assets.filter((a) => a.bytes > 1_000_000).sort((a, b) => b.bytes - a.bytes),
};

fs.mkdirSync(path.join(ROOT, 'migration'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'migration/legacy-audit.json'),
  JSON.stringify(report, null, 2) + '\n',
);
const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
console.log(`pages: ${report.summary.pages} (${report.summary.nonUtf8Pages} Windows-1252)`);
console.log(
  `assets: ${report.summary.assets}, ${mb(report.summary.assetBytes)}; >1MB: ${report.oversizedAssets.length}`,
);
console.log(`broken refs: ${broken.length}`);
broken.forEach((b) => console.log(`  ${b.from}: ${b.ref}`));
console.log(`orphan pages: ${report.orphanPages.join(', ')}`);
console.log(`unreferenced assets: ${report.unreferencedAssets.length}`);
console.log('wrote migration/legacy-audit.json');
