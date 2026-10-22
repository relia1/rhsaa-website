#!/usr/bin/env node
// PostToolUse hook (Write|Edit): format the file Claude just wrote, then lint it.
//  1. Prettier on files under src/, docs/ or scripts/, so formatting never fails `bun run verify`.
//  2. The convention linter (scripts/lint-conventions.mjs) on files under src/.
// Problems are written to stderr with exit 2, which Claude sees right away. Internal errors never
// block. One hook doing both in order: Claude Code runs matching hooks in parallel, so separate
// format and lint hooks raced and lint reported line numbers from before formatting.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const project = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
const file = input.tool_input?.file_path;
if (!file) process.exit(0);
const abs = path.resolve(input.cwd ?? project, file);
// Forward slashes so the checks below also match on Windows (path.relative gives src\x).
const rel = path.relative(project, abs).replace(/\\/g, '/');
const feedback = [];

if (
  /^(src|docs|scripts)\//.test(rel) &&
  /\.(astro|ts|tsx|js|mjs|css|md|mdx|json|ya?ml)$/.test(rel)
) {
  // Prettier's JS entry point through node: no dependence on package-manager .bin shims.
  const r = spawnSync(
    process.execPath,
    [
      path.join(project, 'node_modules/prettier/bin/prettier.cjs'),
      '--write',
      '--no-color',
      '--log-level',
      'warn',
      rel,
    ],
    { cwd: project, encoding: 'utf8', timeout: 20000 },
  );
  if (r.status !== 0 && r.stderr)
    feedback.push(`Prettier could not format ${rel}:\n${r.stderr.trim()}`);
}

try {
  const lint = await import(pathToFileURL(path.join(project, 'scripts/lint-conventions.mjs')).href);
  const issues = lint.lintFile(abs);
  if (issues.length)
    feedback.push(
      `Convention check (AGENTS.md hard rules) found ${issues.length} issue(s) — fix them, or add a justified \`lint-ignore <rule>\` comment:\n` +
        issues.map(lint.format).join('\n'),
    );
} catch {
  // linting is best-effort here; `bun run lint` is the gate
}

if (feedback.length) {
  process.stderr.write(feedback.join('\n\n') + '\n');
  process.exit(2);
}
process.exit(0);
