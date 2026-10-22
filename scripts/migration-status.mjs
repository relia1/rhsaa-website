#!/usr/bin/env node
// Print migration progress.  Usage: bun run status [--all]
// Route counts come from migration/status.json. Phases whose work isn't tied to a route
// (0 foundation, 1 content model, 5 cutover) are checked by looking for the files they produce.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/legacy.mjs';
import { legacyRedirects } from '../src/config/redirects.mjs';

const { routes, legacySource } = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'migration/status.json'), 'utf8'),
);
const entries = Object.entries(routes);
const states = ['todo', 'in-progress', 'migrated', 'verified', 'dropped'];
const count = (list, s) => list.filter(([, r]) => r.status === s).length;
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// Find a component by file name anywhere under src/components (location isn't fixed by the plan).
function findComponent(name) {
  const dir = path.join(ROOT, 'src/components');
  if (!fs.existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(path.join(d, e.name));
      else if (e.name === name) return true;
    }
  }
  return false;
}

// Phase 0: the foundation files listed in docs/MIGRATION_PLAN.md → Phase 0.
function foundationNote() {
  const required = [
    ['src/config/site.ts', exists('src/config/site.ts')],
    ['BaseLayout', exists('src/layouts/BaseLayout.astro')],
    ['PageLayout', exists('src/layouts/PageLayout.astro')],
    ...['Header', 'Footer', 'Hero', 'Section', 'Callout', 'Card', 'CardGrid', 'BackLink'].map(
      (c) => [c, findComponent(`${c}.astro`)],
    ),
    ['404 page', exists('src/pages/404.astro')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([n]) => n);
  if (missing.length === 0) return 'layout: done';
  if (missing.length === required.length) return 'layout: not started';
  return `layout: ${required.length - missing.length}/${required.length} (missing ${missing.join(', ')})`;
}

// Phase 1: planned collections = every `model` in the tracker that is a collection name.
function contentModelNote() {
  const planned = [...new Set(entries.map(([, r]) => r.model))].filter(
    (m) => m && /^[a-z][A-Za-z]+$/.test(m),
  );
  const file = path.join(ROOT, 'src/content.config.ts');
  if (!fs.existsSync(file))
    return `not started (src/content.config.ts missing; ${planned.length} planned)`;
  const src = fs.readFileSync(file, 'utf8');
  const exported = src.match(/export\s+const\s+collections\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const defined = planned.filter((m) => new RegExp(`\\b${m}\\b`).test(exported));
  const missing = planned.filter((m) => !defined.includes(m));
  return `${defined.length}/${planned.length} collections${missing.length ? ` (missing ${missing.join(', ')})` : ': done'}`;
}

// Phase 5: redirects.mjs sanity. Legacy `*.html` URLs keep working through
// `build.format: 'preserve'`, not redirects (DECISIONS.md 2026-10-21): an `/x/index.html` key
// collides with the real page, and a redirect to itself loops.
function cutoverNote() {
  const trim = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  const entries = Object.entries(legacyRedirects);
  const problems = entries
    .filter(([from, to]) => from.endsWith('/index.html') || trim(from) === trim(String(to)))
    .map(([from]) => from);
  return `${entries.length} redirect(s)${problems.length ? `; BROKEN: ${problems.join(', ')}` : ''}; legacy *.html URLs: served by build.format 'preserve'`;
}

// legacy/ is a snapshot of the live site's branch; warn when that branch has moved since.
function sourceWarning() {
  if (!legacySource?.ref || !legacySource?.commit) return null;
  const r = spawnSync('git', ['rev-parse', '--verify', '-q', legacySource.ref], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const head = r.status === 0 ? r.stdout.trim() : null;
  if (!head || head.startsWith(legacySource.commit)) return null;
  return `WARNING: ${legacySource.ref} is at ${head.slice(0, 7)}, but legacy/ is a copy of ${legacySource.commit.slice(0, 7)}. The live site changed: see MIGRATION_PLAN.md → Legacy source.`;
}

const PHASES = [
  { n: 0, name: 'Foundation', note: foundationNote },
  { n: 1, name: 'Content model', note: contentModelNote },
  { n: 2, name: 'Simple pages' },
  { n: 3, name: 'Collection pages' },
  { n: 4, name: 'Embeds & forms' },
  { n: 5, name: 'Cutover', note: cutoverNote },
];

const total = entries.length;
console.log(
  `${count(entries, 'verified')}/${total} verified · ${count(entries, 'migrated')} migrated · ${count(entries, 'in-progress')} in progress · ${count(entries, 'todo')} todo · ${count(entries, 'dropped')} dropped\n`,
);
const warning = sourceWarning();
if (warning) console.log(`${warning}\n`);

const W = 20;
console.log('phase'.padEnd(W) + states.map((s) => s.padStart(12)).join(''));
const known = new Set(PHASES.map((p) => p.n));
const unknown = [...new Set(entries.map(([, r]) => r.phase))].filter((n) => !known.has(n));
for (const { n, name, note } of [
  ...PHASES,
  ...unknown.map((n) => ({ n, name: '(not in plan)' })),
]) {
  const list = entries.filter(([, r]) => r.phase === n);
  const cells = list.length
    ? states.map((s) => String(count(list, s)).padStart(12)).join('')
    : states.map(() => '-'.padStart(12)).join('');
  console.log(`${`${n} ${name}`.padEnd(W)}${cells}${note ? `   ${note()}` : ''}`);
}

const showAll = process.argv.includes('--all');
const open = entries.filter(([, r]) => showAll || !['verified', 'dropped'].includes(r.status));
console.log(`\n${showAll ? 'All' : 'Open'} routes:`);
for (const [route, r] of open.sort((a, b) => a[1].phase - b[1].phase || a[0].localeCompare(b[0]))) {
  const tgt = r.target !== route ? ` -> ${r.target}` : '';
  console.log(
    `  [${r.phase}] ${r.status.padEnd(11)} ${route}${tgt}${r.model ? `  (${r.model})` : ''}`,
  );
}
