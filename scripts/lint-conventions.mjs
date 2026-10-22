#!/usr/bin/env node
// Mechanical checks for the hard rules in AGENTS.md / docs/ARCHITECTURE.md that a regex can see:
// Bootstrap/jQuery leftovers, inline styles, raw hex colours, local <img>, font CDNs and
// font-family strings, site constants outside src/config/site.ts, relative internal links,
// target=_blank without noopener, imports from legacy/.
//
// Usage: bun run lint [files...]      (default: everything under src/)
// Exceptions: put `lint-ignore <rule-id>` in a comment on the same or the previous line (or
// above the start of a multi-line tag), and say why. Also used by .claude/hooks/post-write.mjs
// on every file Claude writes. Rule tests: bun run lint:test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LINTED = /\.(astro|ts|tsx|js|mjs|md|mdx|ya?ml|json|css)$/;

const MARKUP = /\.(astro|md|mdx)$/;
const CODE = /\.(astro|ts|tsx|js|mjs)$/;
const NOT_TOKENS = (f) => f !== 'src/styles/global.css';
const NOT_SITE_CONFIG = (f) => !/^src\/config\//.test(f);

// Class names that only exist in Bootstrap 4 (Tailwind has container, text-center, m-4, …).
// Grid: Bootstrap's col / col-6 / col-md-4 / col-lg-auto; Tailwind's col-span-*, col-start-*,
// col-end-* and col-auto are fine. (col-6 is also Tailwind v4 grid-column: 6 — flagged as ambiguous.)
const BOOTSTRAP =
  /^(row|no-gutters|container-fluid|col|col-\d+|col-(sm|md|lg|xl)(-\d+|-auto)?|offset-\w+|card-(body|title|text|header|footer|deck|columns|img|img-top|img-bottom|subtitle|link)|btn|btn-[\w-]+|navbar[\w-]*|nav-(item|link|tabs|pills)|dropdown-(menu|item|toggle|divider)|d-(none|block|inline|inline-block|flex|inline-flex|table)|d-(sm|md|lg|xl)-\w+|justify-content-\w+|align-items-\w+|align-self-\w+|img-fluid|img-thumbnail|jumbotron[\w-]*|text-muted|list-unstyled|list-inline(-item)?|float-(sm|md|lg|xl)-\w+|embed-responsive[\w-]*|form-(group|control|row|check[\w-]*)|input-group[\w-]*|badge-\w+|alert-\w+|mr-auto|ml-auto|font-weight-\w+)$/;

/** @type {{id: string, applies: (file: string) => boolean, find: (text: string, file: string) => Iterable<{index: number, msg: string}>}[]} */
export const RULES = [
  {
    id: 'bootstrap',
    applies: (f) => MARKUP.test(f) || /\.(ts|tsx)$/.test(f),
    *find(text) {
      for (const m of text.matchAll(/\bclass(?:Name|:list)?=(["'{])([^"'}]*)/g))
        for (const c of m[2].split(/\s+/))
          if (BOOTSTRAP.test(c))
            yield { index: m.index, msg: `Bootstrap class "${c}" — use Tailwind utilities` };
      for (const m of text.matchAll(/\bdata-(toggle|target|dismiss|bs-\w+)=/g))
        yield { index: m.index, msg: `Bootstrap JS attribute ${m[0].slice(0, -1)}` };
    },
  },
  {
    id: 'inline-style',
    applies: (f) => MARKUP.test(f),
    *find(text) {
      for (const m of text.matchAll(/<[a-zA-Z][^>]*?\sstyle=/g))
        yield { index: m.index, msg: 'inline style="" — use Tailwind utilities / tokens' };
    },
  },
  {
    id: 'hex-color',
    applies: (f) => (CODE.test(f) || f.endsWith('.css')) && NOT_TOKENS(f),
    *find(text) {
      const masked = text.replace(/\b(href|id|for|aria-\w+|data-[\w-]+)=(["'])[^"']*\2/g, (s) =>
        ' '.repeat(s.length),
      );
      for (const m of masked.matchAll(
        /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
      ))
        yield { index: m.index, msg: `raw colour ${m[0]} — add/use a token in global.css` };
    },
  },
  {
    id: 'raw-img',
    applies: (f) => MARKUP.test(f),
    *find(text) {
      for (const m of text.matchAll(/<img\b[^>]*?\ssrc=["'](?!https?:|data:)[^"']*["']/g))
        yield { index: m.index, msg: 'local <img src> — use <Image>/<Picture> from astro:assets' };
      for (const m of text.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)/g))
        yield {
          index: m.index,
          msg: `Markdown image from public path ${m[1]} — put it in src/assets and use a relative path`,
        };
    },
  },
  {
    id: 'font-cdn',
    applies: () => true,
    *find(text) {
      for (const m of text.matchAll(
        /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net/g,
      ))
        yield {
          index: m.index,
          msg: `font CDN ${m[0]} — fonts are self-hosted (AGENTS.md rule 11)`,
        };
    },
  },
  {
    id: 'font-family',
    applies: (f) => (CODE.test(f) || f.endsWith('.css')) && NOT_TOKENS(f),
    *find(text) {
      // font-[650] is a weight, not a family.
      for (const m of text.matchAll(/font-family\s*:|\bfont-\[(?!\d)[^\]]+\]/g))
        yield { index: m.index, msg: 'font-family string — use font-display / font-body' };
    },
  },
  {
    id: 'site-constant',
    applies: (f) => NOT_SITE_CONFIG(f) && (CODE.test(f) || /\.(ya?ml|json)$/.test(f)),
    *find(text, file) {
      const code = CODE.test(file);
      if (code)
        for (const m of text.matchAll(
          /(?<![\w.+-])[\w.+-]+@[\w-]+(\.[\w-]+)*\.(org|com|net|edu|us)\b/g,
        ))
          yield { index: m.index, msg: `email ${m[0]} — read it from src/config/site.ts` };
      for (const m of text.matchAll(/hosted_button_id\W{1,6}[A-Z0-9]{8,}/g))
        yield { index: m.index, msg: 'PayPal hosted_button_id literal — use src/config/site.ts' };
      for (const m of text.matchAll(/[\w.-]*list-manage\.com[^\s"'`)]*/g))
        yield { index: m.index, msg: 'Mailchimp URL/id literal — use src/config/site.ts' };
      // Profile/channel roots only (facebook.com/RooseveltAlumni, youtube.com/@x): links to a
      // post, video or event (facebook.com/share/p/…, youtube.com/watch?v=…) are page content.
      if (code)
        for (const m of text.matchAll(
          /https?:\/\/(www\.)?(facebook|instagram|twitter|x|linkedin|youtube)\.com\/(?!(embed|watch|share|posts|events|photo|photos|story|permalink|reel|p|shorts|groups)\b)((channel|c|user|company|in)\/)?[\w.@-]+\/?(?=$|[\s"'`)<>?#])/gm,
        ))
          yield { index: m.index, msg: `social link ${m[0]} — use src/config/site.ts` };
    },
  },
  {
    id: 'relative-link',
    applies: (f) => MARKUP.test(f),
    *find(text, file) {
      for (const m of text.matchAll(
        /<a\b[^>]*?\shref=["'](?!https?:|mailto:|tel:|#|\/|\{|data:|javascript:)([^"']+)["']/g,
      ))
        yield { index: m.index, msg: `relative link "${m[1]}" — use a root-absolute path` };
      // Markdown link syntax only means a link in Markdown (in .astro, `fns[k](v)` is code).
      if (/\.mdx?$/.test(file))
        for (const m of text.matchAll(
          /(?<!!)\[[^\]\n]*\]\((?!https?:|mailto:|tel:|#|\/)([^)\s]+)\)/g,
        ))
          yield {
            index: m.index,
            msg: `relative Markdown link "${m[1]}" — use a root-absolute path`,
          };
    },
  },
  {
    id: 'blank-noopener',
    applies: (f) => MARKUP.test(f),
    *find(text) {
      for (const m of text.matchAll(/<a\b[^>]*>/g))
        if (/\starget=["']_blank["']/.test(m[0]) && !/\srel=["'][^"']*noopener/.test(m[0]))
          yield { index: m.index, msg: 'target="_blank" without rel="noopener"' };
    },
  },
  {
    id: 'jquery',
    applies: (f) => CODE.test(f),
    *find(text) {
      for (const m of text.matchAll(
        /(?<![\w$])(\$\(|jQuery\b)|code\.jquery\.com|bootstrap(\.bundle)?(\.min)?\.js/g,
      ))
        yield {
          index: m.index,
          msg: `jQuery/Bootstrap JS (${m[0]}) — use a small <script> or <details>`,
        };
    },
  },
  {
    id: 'legacy-import',
    applies: (f) => CODE.test(f) || MARKUP.test(f),
    *find(text) {
      for (const m of text.matchAll(/(from\s+|import\(|src=|href=)["'][^"']*\blegacy\//g))
        yield { index: m.index, msg: 'reference into legacy/ — copy the asset into src/assets/' };
    },
  },
];

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// `lint-ignore a, b` ignores rules a and b on that line. A rule id is required: a bare
// `lint-ignore` (or `lint-ignore: reason`) ignores nothing.
function ignored(lineText, id) {
  const m = lineText.match(/lint-ignore((?:[\s,]+[a-z][\w-]*)*)/);
  if (!m) return false;
  return m[1].split(/[\s,]+/).includes(id);
}

// Start index of the tag containing `index`, if `index` is inside a tag that began earlier
// (Prettier wraps long tags, putting attributes on lines below the `<tag`).
function tagStart(text, index) {
  const lt = text.lastIndexOf('<', index);
  if (lt < 0 || text.lastIndexOf('>', index - 1) > lt) return null;
  return lt;
}

/** Lint one file's text. `file` is repo-relative with forward slashes. */
export function lintText(file, text) {
  const lines = text.split('\n');
  const issues = [];
  // An issue is ignored by a comment on its line, the line before it, or — when the issue sits
  // inside a multi-line tag — the line where that tag starts or the line before that.
  const isIgnored = (index, id) => {
    const candidates = [lineOf(text, index)];
    const start = tagStart(text, index);
    if (start !== null) candidates.push(lineOf(text, start));
    return candidates.some(
      (l) => ignored(lines[l - 1] ?? '', id) || ignored(lines[l - 2] ?? '', id),
    );
  };
  for (const rule of RULES) {
    if (!rule.applies(file)) continue;
    for (const { index, msg } of rule.find(text, file)) {
      if (isIgnored(index, rule.id)) continue;
      issues.push({ file, line: lineOf(text, index), rule: rule.id, msg });
    }
  }
  return issues.sort((a, b) => a.line - b.line);
}

export function lintFile(absPath) {
  const file = path.relative(ROOT, absPath).replace(/\\/g, '/');
  if (!file.startsWith('src/') || !LINTED.test(file)) return [];
  return lintText(file, fs.readFileSync(absPath, 'utf8'));
}

export const format = (i) => `${i.file}:${i.line}  [${i.rule}]  ${i.msg}`;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (LINTED.test(e.name)) out.push(p);
  }
  return out;
}

const isMain =
  process.argv[1] !== undefined &&
  fs.realpathSync(fileURLToPath(import.meta.url)) ===
    fs.realpathSync(path.resolve(process.argv[1]));
if (isMain) {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((a) => path.resolve(a)) : walk(path.join(ROOT, 'src'));
  const issues = files.flatMap(lintFile);
  issues.forEach((i) => console.error(format(i)));
  console.log(
    `lint-conventions: ${files.length} files, ${issues.length} issue${issues.length === 1 ? '' : 's'}`,
  );
  process.exit(issues.length ? 1 : 0);
}
