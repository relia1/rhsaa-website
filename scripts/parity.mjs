#!/usr/bin/env node
// Side-by-side parity check of a legacy page vs. its rewrite.
//  - Serves legacy/ on :4322 (same as `bun run legacy:serve`)
//  - Expects the new site at NEW_URL (default http://localhost:4321) — start it with
//    `bunx astro dev --background` or `bun run build && bun run preview`.
//  - Captures full-page screenshots at mobile/tablet/desktop widths for both, plus readable
//    tiles (<site>-<width>-<n>.png, one per 1600 px of page height, max 6).
//  - Diffs visible text: every legacy sentence must appear in the new page.
//  - Compares images and internal/external links.
//  - Reports requests that failed to load (legacy needs CDNs for Bootstrap, jQuery and its
//    header/footer includes; without them its screenshots are unstyled or blank).
// Writes migration/parity/<slug>/{report.md, report.json, *.png}. Exits 1 if content is missing,
// the new page has the wrong HTTP status (404 for /404, else 200) or not exactly one <h1>.
//
// --review (parity-reviewer): compare with the previous review run of this route
// (report.review.json), list regressions, then save this run as the new review baseline.
//
// Usage: bun run parity /about/board [--target /about/board] [--no-shots] [--no-fail] [--review]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, cliArgs } from './lib/legacy.mjs';
import { server as legacyServer } from './legacy-serve.mjs';

const args = cliArgs();
const legacyRoute = args.find((a) => a.startsWith('/'));
if (!legacyRoute) {
  console.error(
    'usage: parity <legacy-route> [--target <new-route>] [--no-shots] [--no-fail] [--review]',
  );
  process.exit(2);
}
const flag = (n) => args.includes(n);
const ti = args.indexOf('--target');
const newRoute = ti >= 0 ? args[ti + 1] : legacyRoute;
const LEGACY_PORT = Number(process.env.LEGACY_PORT ?? 4322);
const NEW_URL = (process.env.NEW_URL ?? 'http://localhost:4321').replace(/\/$/, '');
const slug = legacyRoute.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'home';
const outDir = path.join(ROOT, 'migration/parity', slug);
fs.mkdirSync(outDir, { recursive: true });
// The not-found page is served with 404 by Astro (legacy's static 404.html answers 200).
const expectedStatus = newRoute.replace(/\/$/, '') === '/404' ? 404 : 200;

// Astro 7's dev server answers /_astro/status with {"ok":true} once it is ready;
// `astro preview` has no such endpoint, so fall back to fetching the root.
const reachable = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
};
if (!(await reachable(`${NEW_URL}/_astro/status`)) && !(await reachable(NEW_URL))) {
  console.error(
    `New site not reachable at ${NEW_URL}. Start it with \`bunx astro dev --background\` (or build + preview).`,
  );
  process.exit(2);
}

// Several parity runs may happen at once (parallel reviewers). If :4322 is taken, serve
// legacy/ on a free port instead; each run owns its server, so none depends on another.
const legacyPort = await new Promise((resolve, reject) => {
  legacyServer.once('error', (e) => {
    if (e.code !== 'EADDRINUSE') return reject(e);
    legacyServer.listen(0, () => resolve(legacyServer.address().port));
  });
  legacyServer.listen(LEGACY_PORT, () => resolve(LEGACY_PORT));
});

const browser = await chromium.launch(
  fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {},
);
const widths = { mobile: 390, tablet: 768, desktop: 1280 };

// Wait for `load`, then give late requests (legacy's jQuery header/footer includes) a few
// seconds. Pages with third-party embeds may never reach network idle; that is not an error.
async function open(page, url) {
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch((e) => e);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  return resp;
}

// Requests that failed or returned >= 400 while loading a page.
function watchFailures(page) {
  const failed = new Set();
  page.on('requestfailed', (r) => failed.add(`${r.url()} (${r.failure()?.errorText ?? 'failed'})`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== 'document')
      failed.add(`${r.url()} (HTTP ${r.status()})`);
  });
  return failed;
}

// Content root: legacy uses .main; the rewrite must render page content inside <main>.
async function collect(url, selector) {
  const page = await browser.newPage({ viewport: { width: widths.desktop, height: 900 } });
  const failed = watchFailures(page);
  const resp = await open(page, url);
  const navError = resp instanceof Error ? resp.message.split('\n')[0] : null;
  const data = await page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document.body;
    const abs = (u) => {
      try {
        return new URL(u, location.href);
      } catch {
        return null;
      }
    };
    return {
      title: document.title,
      text: root.innerText,
      images: [...root.querySelectorAll('img')].map((i) => {
        // Every URL the image may load from: <Picture> puts candidates in <source srcset>.
        const sets = [
          i.srcset,
          ...[...(i.parentElement?.querySelectorAll('source') ?? [])].map((s) => s.srcset),
        ];
        return {
          src: i.currentSrc || i.src,
          srcs: [
            i.currentSrc,
            i.src,
            ...sets.flatMap((s) => (s ?? '').split(',').map((c) => c.trim().split(/\s+/)[0])),
          ]
            .filter(Boolean)
            .map((u) => abs(u)?.href ?? u),
          alt: i.getAttribute('alt'),
        };
      }),
      links: [...root.querySelectorAll('a[href]')].map((a) => {
        const u = abs(a.getAttribute('href'));
        return {
          text: a.innerText.trim(),
          href:
            u && u.origin === location.origin
              ? u.pathname.replace(/\/$/, '') || '/'
              : a.getAttribute('href'),
        };
      }),
      h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()),
      headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
        level: Number(h.tagName[1]),
        text: h.innerText.trim().slice(0, 60),
      })),
      blankWithoutNoopener: [...document.querySelectorAll('a[target=_blank]')]
        .filter((a) => !/noopener/.test(a.getAttribute('rel') ?? ''))
        .map((a) => a.getAttribute('href')),
      lang: document.documentElement.lang,
      description:
        document.querySelector('meta[name=description]')?.getAttribute('content') ?? null,
    };
  }, selector);
  await page.close();
  return {
    status: resp instanceof Error ? 0 : (resp?.status?.() ?? 0),
    navError,
    failedRequests: [...failed],
    ...data,
  };
}

const TILE = 1600; // px of page height per tile: small enough to stay legible when viewed
const MAX_TILES = 6;
async function shots(url, prefix) {
  const problems = [];
  for (const [name, width] of Object.entries(widths)) {
    for (const f of fs.readdirSync(outDir))
      if (f.startsWith(`${prefix}-${name}-`) && f.endsWith('.png')) fs.rmSync(path.join(outDir, f));
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const resp = await open(page, url);
    if (resp instanceof Error) problems.push(`${name}: ${resp.message.split('\n')[0]}`);
    // The Astro dev toolbar is not part of the page.
    await page
      .addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' })
      .catch(() => {});
    await page.screenshot({ path: path.join(outDir, `${prefix}-${name}.png`), fullPage: true });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const tiles = Math.min(MAX_TILES, Math.ceil(height / TILE));
    for (let n = 0; n < tiles; n++) {
      const y = n * TILE;
      await page.screenshot({
        path: path.join(outDir, `${prefix}-${name}-${n + 1}.png`),
        fullPage: true,
        clip: { x: 0, y, width, height: Math.min(TILE, height - y) },
      });
    }
    if (height > TILE * MAX_TILES)
      problems.push(
        `${name}: page is ${height}px tall; tiles cover the first ${TILE * MAX_TILES}px`,
      );
    await page.close();
  }
  return problems;
}

const legacyUrl = `http://localhost:${legacyPort}${legacyRoute}`;
const newUrl = `${NEW_URL}${newRoute}`;
const L = await collect(legacyUrl, '.main');
const N = await collect(newUrl, 'main');
const shotProblems = [];
if (!flag('--no-shots')) {
  shotProblems.push(...(await shots(legacyUrl, 'legacy')).map((p) => `legacy ${p}`));
  shotProblems.push(...(await shots(newUrl, 'new')).map((p) => `new ${p}`));
}
await browser.close();
legacyServer.close();

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
const sentences = (t) =>
  t
    .split(/(?<=[.!?])\s+|\n+/)
    .map(norm)
    .filter((s) => s.split(' ').length >= 3);
const newText = ' ' + norm(N.text) + ' ';
const missing = [...new Set(sentences(L.text))].filter(
  (s) => !newText.includes(' ' + s + ' ') && !newText.includes(s),
);
const legacyWords = norm(L.text).split(' ').length;
const newWords = norm(N.text).split(' ').length;

// Compare images by file name. The dev server serves astro:assets images as
// /_image?href=<encoded original path>&w=…, and builds name them <name>.<hash>.<ext>.
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const imgName = (s) => {
  let p = s;
  try {
    const u = new URL(s, 'http://x');
    p = u.pathname.endsWith('/_image') ? (u.searchParams.get('href') ?? '') : u.pathname;
  } catch {}
  return safeDecode(p.split('?')[0].split('/').pop())
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\.[A-Za-z0-9_-]{6,}$/, '')
    .toLowerCase();
};
const newImgs = new Set(N.images.flatMap((i) => (i.srcs?.length ? i.srcs : [i.src]).map(imgName)));
const missingImages = L.images
  .filter((i) => !newImgs.has(imgName(i.src)))
  .map((i) => i.src.replace(/^https?:\/\/[^/]+/, ''));
const imagesWithoutAlt = N.images.filter((i) => i.alt === null).map((i) => i.src);

const newHrefs = new Set(N.links.map((l) => l.href));
const missingLinks = L.links
  .filter((l) => !newHrefs.has(l.href) && !/^#/.test(l.href))
  .map((l) => `${l.text || '(no text)'} -> ${l.href}`);

// A heading may go down any number of levels but only up one at a time (h2 → h4 is a skip).
const headingSkips = (N.headings ?? [])
  .map((h, i, all) => ({ h, prev: all[i - 1] }))
  .filter(({ h, prev }) => (prev ? h.level > prev.level + 1 : h.level !== 1))
  .map(({ h, prev }) => `h${prev?.level ?? 0} → h${h.level} "${h.text}"`);

const report = {
  legacy: {
    url: legacyUrl,
    status: L.status,
    title: L.title,
    words: legacyWords,
    failedRequests: L.failedRequests,
  },
  new: {
    url: newUrl,
    status: N.status,
    expectedStatus,
    title: N.title,
    words: newWords,
    h1: N.h1,
    lang: N.lang,
    description: N.description,
    failedRequests: N.failedRequests,
  },
  missingSentences: missing,
  missingImages,
  missingLinks: [...new Set(missingLinks)],
  a11y: {
    imagesWithoutAlt,
    h1Count: N.h1.length,
    hasLang: Boolean(N.lang),
    headingSkips,
    blankWithoutNoopener: N.blankWithoutNoopener,
  },
  screenshotProblems: shotProblems,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

// Review baseline: anything missing now that was present at the previous review is a regression.
const baselineFile = path.join(outDir, 'report.review.json');
let regressions = null;
if (flag('--review')) {
  if (fs.existsSync(baselineFile)) {
    const prev = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const newly = (key) => report[key].filter((x) => !(prev[key] ?? []).includes(x));
    regressions = {
      missingSentences: newly('missingSentences'),
      missingImages: newly('missingImages'),
      missingLinks: newly('missingLinks'),
    };
  }
  fs.copyFileSync(path.join(outDir, 'report.json'), baselineFile);
}
const regressionCount = regressions
  ? Object.values(regressions).reduce((n, list) => n + list.length, 0)
  : 0;

const loadProblems = (label, list) =>
  list.length
    ? [
        `- ${label}: ${list.length} request(s) failed${label === 'legacy' ? ' — legacy screenshots may be unstyled or miss the header/footer (CDN unreachable?)' : ''}`,
        ...list.slice(0, 10).map((u) => `  - ${u}`),
      ]
    : [];
const problems = [
  ...(L.navError ? [`- legacy navigation: ${L.navError}`] : []),
  ...(N.navError ? [`- new navigation: ${N.navError}`] : []),
  ...loadProblems('legacy', L.failedRequests),
  ...loadProblems('new', N.failedRequests),
  ...shotProblems.map((p) => `- screenshots: ${p}`),
];

const md = [
  `# Parity: ${legacyRoute} -> ${newRoute}`,
  '',
  `| | legacy | new |`,
  `|---|---|---|`,
  `| HTTP | ${L.status} | ${N.status}${N.status === expectedStatus ? '' : ` (expected ${expectedStatus})`} |`,
  `| title | ${L.title} | ${N.title} |`,
  `| words | ${legacyWords} | ${newWords} |`,
  '',
  ...(problems.length ? ['## Load problems', ...problems, ''] : []),
  ...(regressions
    ? [
        `## Regressions since the last review (${regressionCount})`,
        ...(regressionCount
          ? Object.entries(regressions).flatMap(([k, list]) => list.map((x) => `- ${k}: ${x}`))
          : ['None.']),
        '',
      ]
    : []),
  `## Missing text (${missing.length})`,
  ...(missing.length ? missing.map((s) => `- ${s}`) : ['None.']),
  '',
  `## Missing images (${missingImages.length})`,
  ...(missingImages.length ? missingImages.map((s) => `- ${s}`) : ['None.']),
  '',
  `## Missing links (${report.missingLinks.length})`,
  ...(report.missingLinks.length ? report.missingLinks.map((s) => `- ${s}`) : ['None.']),
  '',
  '## Accessibility basics',
  `- <h1> count: ${N.h1.length} ${N.h1.length === 1 ? 'OK' : '(expected exactly 1)'}`,
  `- <html lang>: ${N.lang || 'MISSING'}`,
  `- images without alt attribute: ${imagesWithoutAlt.length}`,
  `- heading level skips: ${headingSkips.length ? headingSkips.join('; ') : 'none'}`,
  `- target=_blank without rel=noopener: ${N.blankWithoutNoopener.length ? N.blankWithoutNoopener.join(', ') : 'none'}`,
  '',
  flag('--no-shots')
    ? ''
    : `Screenshots (full page; read the numbered tiles for detail): ${Object.keys(widths)
        .map((w) => `legacy-${w}[-N].png / new-${w}[-N].png`)
        .join(', ')}`,
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md + '\n');
console.log(md);
console.log(`\nwrote ${path.relative(ROOT, outDir).replace(/\\/g, '/')}/`);
if (L.failedRequests.length)
  console.warn(
    `\nWARNING: ${L.failedRequests.length} legacy request(s) failed; legacy screenshots are degraded.`,
  );

const failed =
  N.status !== expectedStatus ||
  missing.length > 0 ||
  missingImages.length > 0 ||
  N.h1.length !== 1;
process.exit(failed && !flag('--no-fail') ? 1 : 0);
