#!/usr/bin/env node
// SessionStart hook: put the migration tracker summary and dev-server state into context,
// so a session starts from migration/status.json instead of re-exploring legacy/.
// stdout of a SessionStart hook is added to Claude's context. Never fails the session.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const project = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const out = [];
try {
  const r = spawnSync(process.execPath, [path.join(project, 'scripts/migration-status.mjs')], {
    cwd: project,
    encoding: 'utf8',
    timeout: 15000,
  });
  // Keep the summary and phase table; the open-route list can be long.
  const text = (r.stdout ?? '').split('\nOpen routes:')[0].trim();
  if (text) out.push('## RHSAA migration status (bun run status)', text);
} catch {}

try {
  // legacy/ must match the last commit; surface any change before work starts.
  const r = spawnSync(process.execPath, [path.join(project, 'scripts/check-legacy.mjs')], {
    cwd: project,
    encoding: 'utf8',
    timeout: 15000,
  });
  if (r.status === 1) out.push(`WARNING: ${(r.stderr ?? '').trim()}`);
} catch {}

try {
  const lock = JSON.parse(fs.readFileSync(path.join(project, '.astro/dev.json'), 'utf8'));
  let alive = false;
  try {
    process.kill(lock.pid, 0);
    alive = true;
  } catch {}
  out.push(
    alive
      ? `Dev server: running at ${lock.url ?? `port ${lock.port}`} (pid ${lock.pid}).`
      : 'Dev server: not running (stale lock). Start with `bunx astro dev --background --force`.',
  );
} catch {
  out.push('Dev server: not running. Start with `bunx astro dev --background` when needed.');
}

if (out.length)
  console.log(
    out.join('\n') +
      '\nUse /migration-status for the full list and next step; record tracker changes with `bun run track`.',
  );
process.exit(0);
