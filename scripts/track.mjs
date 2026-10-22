#!/usr/bin/env node
// Update one route in migration/status.json without hand-editing JSON.
//
// Usage:
//   bun run track <route> <status> [--note "text"] [--target /new/path] [--review <file>]
//   bun run track <route>                      print the entry
//
// status: todo | in-progress | migrated | verified | dropped
//  - verified needs --review <file>: the parity-reviewer verdict saved by the orchestrator
//    (convention: migration/reviews/<slug>.md). Its first line must be "VERDICT: PASS" and its
//    "Route:" line must name this route.
//  - dropped needs --note naming the owner decision (AGENTS.md rule 8).
//  - --target that differs from the legacy route reminds you to add a redirect.
// Notes are appended (dated), never replaced.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cliArgs } from './lib/legacy.mjs';

const STATUSES = ['todo', 'in-progress', 'migrated', 'verified', 'dropped'];
const FILE = path.join(ROOT, 'migration/status.json');
const norm = (r) => (r.length > 1 ? r.replace(/\/$/, '') : r); // '/about/' ≡ '/about'

const args = cliArgs();
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`${name} needs a value`);
  args.splice(i, 2);
  return v;
};
function fail(msg) {
  console.error(`track: ${msg}`);
  process.exit(1);
}

const note = opt('--note');
const target = opt('--target');
const review = opt('--review');
const [rawRoute, status, ...extra] = args;
if (!rawRoute || extra.length)
  fail('usage: track <route> [<status>] [--note "…"] [--target /x] [--review <file>]');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const route = rawRoute.length > 1 ? rawRoute.replace(/\/$/, '') : rawRoute;
const key = data.routes[route] ? route : data.routes[route + '/'] ? route + '/' : null;
if (!key) {
  const close = Object.keys(data.routes).filter((r) => r.includes(route.split('/').pop() || '/'));
  fail(`unknown route ${route}${close.length ? ` — did you mean ${close.join(', ')}?` : ''}`);
}
const entry = data.routes[key];

if (!status && !note && !target && !review) {
  console.log(JSON.stringify({ [key]: entry }, null, 2));
  process.exit(0);
}

if (status) {
  if (!STATUSES.includes(status)) fail(`status must be one of ${STATUSES.join(' | ')}`);
  if (status === 'verified') {
    if (!review) fail('verified needs --review <file> with the parity-reviewer PASS verdict');
    const reviewPath = path.resolve(review);
    if (!fs.existsSync(reviewPath)) fail(`review file not found: ${review}`);
    // The verdict format (parity-reviewer.md) starts `VERDICT: PASS` then `Route: <legacy> → …`.
    // Tolerate Markdown decoration (code fences, **bold**, # headings) around those lines.
    const lines = fs
      .readFileSync(reviewPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s#>*`_-]+|[\s*`_]+$/g, ''))
      .filter(Boolean);
    if (!/^VERDICT:\s*PASS\b/.test(lines[0] ?? ''))
      fail(`${review} must start with "VERDICT: PASS" (first line: "${lines[0] ?? ''}")`);
    const reviewed = lines.find((l) => /^Route:/.test(l))?.match(/^Route:\s*(\S+)/)?.[1];
    if (!reviewed || norm(reviewed) !== norm(key))
      fail(
        `${review} reviews ${reviewed ?? '(no "Route:" line)'}, not ${key} — wrong review file?`,
      );
  }
  if (status === 'dropped' && !note) fail('dropped needs --note with the owner decision');
}

const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const changes = [];
if (status && status !== entry.status) {
  changes.push(`status ${entry.status} → ${status}`);
  entry.status = status;
}
if (target && target !== entry.target) {
  changes.push(`target ${entry.target} → ${target}`);
  entry.target = target;
}
if (review) entry.review = path.relative(ROOT, path.resolve(review)).replace(/\\/g, '/');
if (note) {
  const line = `${today}: ${note}`;
  entry.notes = entry.notes ? `${entry.notes} | ${line}` : line;
  changes.push('note added');
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`${key}: ${changes.join(', ') || 'no change'}`);
if (norm(entry.target) !== norm(key) && ['migrated', 'verified'].includes(entry.status))
  console.log(
    `reminder: target differs from the legacy URL — make sure src/config/redirects.mjs has '${key}' → '${entry.target}'.`,
  );
