#!/usr/bin/env node
// PreToolUse hook: block any file write/edit inside legacy/ (read-only source of truth),
// and Bash/PowerShell commands that would modify it. Exit code 2 blocks the call and shows
// stderr to Claude. Copying *from* legacy/ (cp / Copy-Item with legacy as the source) is allowed.
// A speed bump, not a sandbox: commands can reach legacy/ in ways a pattern can't see
// (`cd legacy && rm x`, scripts). `bun run legacy:check` (git status) is the safety net.
import path from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const win = process.platform === 'win32';
const fold = (p) => (win ? p.toLowerCase() : p);
const project = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
const legacy = fold(path.join(project, 'legacy') + path.sep);
const tool = input.tool_name ?? '';
const ti = input.tool_input ?? {};

const block = (why) => {
  process.stderr.write(
    `Blocked: ${why}\nlegacy/ is read-only (AGENTS.md rule 1). Copy what you need into src/ or public/ instead.\n`,
  );
  process.exit(2);
};

const file = ti.file_path ?? ti.notebook_path ?? ti.path;
if (file && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const abs = fold(path.resolve(input.cwd ?? project, file));
  if (abs.startsWith(legacy)) block(`${tool} on ${path.relative(project, abs)}`);
}

if (['Bash', 'PowerShell'].includes(tool) && typeof ti.command === 'string') {
  // Normalise Windows separators and quotes so one set of patterns covers both shells.
  const cmd = ti.command.replace(/\\/g, '/').replace(/["']/g, '');
  // legacy/ itself or a path inside it. Case-sensitive on purpose: the folder is lowercase, and
  // an identifier like `LEGACY` in a sed/script expression isn't a path.
  const L = String.raw`(?:\S*/)?legacy(?:/|\s|$)`;
  const inLegacy = new RegExp(String.raw`(^|\s)${L}`);
  // Commands (at command position of a pipeline segment) that modify their path arguments.
  const MUTATORS = [
    // POSIX / Git Bash
    'rm',
    'rmdir',
    'unlink',
    'truncate',
    'chmod',
    'chown',
    'touch',
    'shred',
    String.raw`sed\s+(-\w*\s+)*-i`,
    String.raw`perl\s+(-\w*\s+)*-i`,
    String.raw`(bunx\s+|npx\s+)?prettier\s+(.*\s)?(--write|-w)`,
    String.raw`git\s+(rm|mv|restore|clean|checkout)`,
    // PowerShell cmdlets and their default aliases
    'Remove-Item',
    'ri',
    'del',
    'erase',
    'rd',
    'Rename-Item',
    'rni',
    'ren',
    'Set-Content',
    'sc',
    'Add-Content',
    'ac',
    'Clear-Content',
    'clc',
    'Out-File',
    'New-Item',
    'ni',
    'Set-ItemProperty',
    'Tee-Object',
    'tee',
    'Expand-Archive',
  ];
  const mutator = new RegExp(
    String.raw`^\s*(sudo\s+|xargs\s+(-\S+\s+)*)?(${MUTATORS.join('|')})\b(?<rest>.*)$`,
    'i',
  );
  // cp / mv / rsync / Copy-Item / Move-Item: only the destination (last positional arg) matters.
  const copyLike = /^\s*(cp|mv|rsync|copy|cpi|move|mi|Copy-Item|Move-Item)\b(.*)$/i;

  const segments = cmd.split(/[|;&\n]+|\$\(|`/);
  const hit = segments.some((part) => {
    const m = part.match(mutator);
    if (m && inLegacy.test(m.groups.rest)) return true;
    const c = part.match(copyLike);
    if (c) {
      const dest = c[2].match(/-Destination(?:Path)?[\s:]+(\S+)/i)?.[1];
      const args = c[2]
        .trim()
        .split(/\s+/)
        .filter((a) => a && !a.startsWith('-'));
      const target = dest ?? (args.length >= 2 ? args.at(-1) : null);
      if (target && new RegExp(`^${L}`).test(target + ' ')) return true;
      // mv/Move-Item also deletes its source.
      if (/^(mv|move|mi|Move-Item)$/i.test(c[1]) && inLegacy.test(c[2])) return true;
    }
    // find legacy … -delete / -exec rm
    if (/^\s*find\b/i.test(part) && inLegacy.test(part) && /-delete|-exec\s+(rm|mv)/i.test(part))
      return true;
    return false;
  });
  // Redirection into legacy anywhere in the command (`=>` is a JS arrow function, not a redirect).
  const redirect = new RegExp(String.raw`(?<!=)>>?\s*${L}`).test(cmd);
  if (hit || redirect) block(`${tool} command touches legacy/: ${ti.command.slice(0, 200)}`);
}
process.exit(0);
