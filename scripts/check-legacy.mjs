#!/usr/bin/env node
// Fail if anything under legacy/ differs from the last commit (modified, deleted or new files).
// legacy/ is read-only (AGENTS.md rule 1). The PreToolUse hook blocks the obvious writes; this
// git check catches everything a command pattern can't see (`cd legacy && rm …`, scripts that
// write files). First step of `bun run verify`; the SessionStart hook runs it too.
// Usage: bun run legacy:check
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// No dependencies, so it also works before `bun install`.
const ROOT = path.resolve(import.meta.dirname, '..');

const r = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'legacy/'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (r.error || r.status !== 0) {
  console.log('legacy:check skipped: not a git checkout, or git is unavailable.');
  process.exit(0);
}
const changes = r.stdout.split('\n').filter(Boolean);
if (!changes.length) {
  console.log('legacy:check: legacy/ matches the last commit.');
  process.exit(0);
}
console.error(`legacy/ has ${changes.length} change(s), but it is read-only (AGENTS.md rule 1):`);
changes.slice(0, 20).forEach((l) => console.error(`  ${l}`));
if (changes.length > 20) console.error(`  … and ${changes.length - 20} more`);
console.error(
  'Stop and ask the user to restore it: `git restore --source=HEAD --staged --worktree -- legacy/`, then delete any new files marked ??.',
);
process.exit(1);
