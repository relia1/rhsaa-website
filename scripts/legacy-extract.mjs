#!/usr/bin/env node
// Extract the content of one legacy page as clean, structured Markdown-ish text,
// with the shared header/footer, Bootstrap scaffolding and scripts removed.
// This is the source of truth an agent migrates from — never paraphrase legacy copy.
//
// Usage:
//   bun run legacy:extract /about/board          (route)
//   bun run legacy:extract about/board.html      (file)
//   add --json for a block list (useful when building content-collection data)
// The route's record from migration/legacy-audit.json (hero, images, PDFs, embeds, forms,
// external links) is appended, so agents never need to read the whole audit file.
import path from 'node:path';
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import {
  LEGACY,
  ROOT,
  cliArgs,
  readLegacy,
  routeToLegacyFile,
  legacyFileToRoute,
  legacyRel,
} from './lib/legacy.mjs';

const args = cliArgs();
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: legacy-extract <route|file> [--json]');
  process.exit(1);
}
const direct = path.join(LEGACY, target);
const file = target.endsWith('.html') && fs.existsSync(direct) ? direct : routeToLegacyFile(target);
if (!file) {
  console.error(`No legacy page for "${target}"`);
  process.exit(1);
}

const rel = legacyRel(file);
const route = legacyFileToRoute(rel);
const { text, encoding } = readLegacy(file);
const root = parse(text, { comment: false });
const title = root.querySelector('title')?.text.trim() ?? '';
const main = root.querySelector('.main') ?? root.querySelector('body') ?? root;

// Resolve a relative URL against the page's served route (directory semantics like a browser).
const base = new URL(route.endsWith('/') ? route : route, 'https://legacy.local');
const abs = (u) => {
  if (!u || /^(mailto:|tel:|https?:|\/\/)/i.test(u)) return u;
  return new URL(u, base).pathname;
};
const norm = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const blocks = [];
const push = (b) => {
  if (b.text !== undefined && !b.text) return;
  blocks.push(b);
};

function inline(node) {
  // Render inline content, keeping links and line breaks.
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.text.replace(/\s+/g, ' ');
    else if (c.tagName === 'BR') out += '\n';
    else if (c.tagName === 'A') {
      const t = norm(inline(c));
      const href = abs(c.getAttribute('href'));
      out += href ? `[${t}](${href})` : t;
    } else if (['B', 'STRONG'].includes(c.tagName)) out += `**${norm(inline(c))}**`;
    else if (['I', 'EM'].includes(c.tagName)) out += `*${norm(inline(c))}*`;
    else if (c.tagName === 'IMG') continue;
    else out += inline(c);
  }
  return out
    .split('\n')
    .map((l) => norm(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BLOCK = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'DL',
  'IMG',
  'IFRAME',
  'FORM',
  'TABLE',
  'HR',
]);

function walk(node) {
  for (const c of node.childNodes) {
    if (c.nodeType === 3) {
      const t = norm(c.text);
      if (t) push({ type: 'text', text: t });
      continue;
    }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName;
    const cls = c.getAttribute('class') ?? '';
    if (tag === 'SCRIPT') {
      push({ type: 'embed', kind: 'script', src: c.getAttribute('src') ?? '(inline)' });
      continue;
    }
    if (/\bphoto[a-z]+\b/.test(cls) && /\brow\b/.test(cls)) {
      push({
        type: 'hero',
        class: cls.match(/\bphoto[a-z]+\b/)[0],
        title: norm(c.querySelector('.photot, p')?.text ?? ''),
      });
      continue;
    }
    if (/^H[1-6]$/.test(tag)) push({ type: 'heading', level: Number(tag[1]), text: inline(c) });
    else if (tag === 'P') {
      if (/phototsmall/.test(cls)) continue;
      push({ type: 'paragraph', text: inline(c), class: cls || undefined });
      for (const img of c.querySelectorAll('img')) walkImg(img);
    } else if (tag === 'UL' || tag === 'OL') {
      push({
        type: 'list',
        items: c
          .querySelectorAll('li')
          .map((li) => inline(li))
          .filter(Boolean),
      });
    } else if (tag === 'DL') {
      const items = [];
      for (const d of c.childNodes.filter((n) => n.nodeType === 1)) {
        if (d.tagName === 'DT') items.push({ text: inline(d).replace(/^-\s*/, ''), sub: [] });
        else if (d.tagName === 'DD' && items.length) items.at(-1).sub.push(inline(d));
      }
      push({
        type: 'list',
        items: items.map((i) => (i.sub.length ? { text: i.text, sub: i.sub } : i.text)),
      });
    } else if (tag === 'IMG') walkImg(c);
    else if (tag === 'IFRAME') push({ type: 'embed', kind: 'iframe', src: c.getAttribute('src') });
    else if (tag === 'FORM') {
      push({
        type: 'form',
        action: c.getAttribute('action'),
        method: c.getAttribute('method'),
        fields: c.querySelectorAll('input,select,textarea').map((i) => ({
          tag: i.tagName.toLowerCase(),
          type: i.getAttribute('type'),
          name: i.getAttribute('name'),
          value: i.getAttribute('value'),
        })),
        note: 'Third-party form: preserve action URL and ALL field names/hidden values exactly.',
      });
    } else if (tag === 'HR') push({ type: 'divider' });
    else if (tag === 'A' && !c.querySelector(Array.from(BLOCK).join(',').toLowerCase())) {
      push({
        type: 'link',
        text: inline(c),
        href: abs(c.getAttribute('href')),
        class: cls || undefined,
      });
    } else {
      // Container: mark cards/blocks so data-heavy pages expose their repeating structure.
      const GROUPS = [
        'queenCard',
        'infoCard',
        'card',
        'blockD',
        'blockB',
        'helpbox',
        'quicklinks',
        'altContentBlock',
      ];
      const tokens = cls.split(/\s+/);
      const marker = GROUPS.find((g) => tokens.includes(g));
      if (marker) {
        blocks.push({ type: 'group-start', kind: marker });
        walk(c);
        blocks.push({ type: 'group-end', kind: marker });
      } else walk(c);
    }
  }
}
function walkImg(img) {
  push({
    type: 'image',
    src: abs(img.getAttribute('src')),
    alt: img.getAttribute('alt') ?? null,
    title: img.getAttribute('title') ?? null,
    hidden: img.hasAttribute('hidden') || undefined,
  });
}
walk(main);

const meta = {
  route,
  file: `legacy/${rel}`,
  encoding,
  title,
  description: root.querySelector('meta[name=description]')?.getAttribute('content') ?? null,
};

let audit = null;
try {
  const report = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'migration/legacy-audit.json'), 'utf8'),
  );
  audit = report.pages.find((p) => p.route === route) ?? null;
  if (audit) {
    const { route: _r, file: _f, title: _t, encoding: _e, ...rest } = audit;
    audit = rest;
  }
} catch {
  // no audit yet (`bun run legacy:audit`)
}

if (asJson) {
  console.log(JSON.stringify({ ...meta, blocks, audit }, null, 2));
} else {
  const out = [`<!-- ${meta.file} (${encoding}) -> ${route} -->`, `<!-- title: ${title} -->`, ''];
  let depth = 0;
  const ind = () => '  '.repeat(depth);
  for (const b of blocks) {
    switch (b.type) {
      case 'hero':
        out.push(`${ind()}[HERO .${b.class}] ${b.title}`);
        break;
      case 'heading':
        out.push(`${ind()}${'#'.repeat(b.level)} ${b.text}`);
        break;
      case 'paragraph':
      case 'text':
        out.push(`${ind()}${b.text.replace(/\n/g, `\n${ind()}`)}`);
        break;
      case 'list':
        for (const i of b.items) {
          if (typeof i === 'string') out.push(`${ind()}- ${i}`);
          else {
            out.push(`${ind()}- ${i.text}`);
            i.sub.forEach((s) => out.push(`${ind()}  - ${s}`));
          }
        }
        break;
      case 'image':
        out.push(`${ind()}![${b.alt ?? b.title ?? ''}](${b.src})${b.hidden ? ' (hidden)' : ''}`);
        break;
      case 'link':
        out.push(`${ind()}-> [${b.text}](${b.href})`);
        break;
      case 'embed':
        out.push(`${ind()}[EMBED ${b.kind}] ${b.src}`);
        break;
      case 'form':
        out.push(
          `${ind()}[FORM ${b.method} ${b.action}] fields: ${b.fields.map((f) => `${f.name}=${f.value ?? ''}`).join(', ')}`,
        );
        break;
      case 'divider':
        out.push(`${ind()}---`);
        break;
      case 'group-start':
        out.push(`${ind()}[${b.kind}]`);
        depth++;
        break;
      case 'group-end':
        depth = Math.max(0, depth - 1);
        break;
    }
  }
  if (audit) {
    const list = (label, items, fmt = (x) => x) =>
      out.push(
        `[AUDIT] ${label} (${items.length})${items.length ? ': ' : ''}${items.map(fmt).join(', ')}`,
      );
    out.push('', '<!-- from migration/legacy-audit.json -->');
    out.push(
      `[AUDIT] hero: ${audit.hero ? `.${audit.hero.class} -> ${audit.hero.image} "${audit.hero.title ?? ''}"` : 'none'}`,
    );
    out.push(`[AUDIT] words: ${audit.words}`);
    list('images', audit.images);
    list('pdfs', audit.pdfs);
    list('embeds', audit.embeds, (e) => `${e.kind} ${e.src}`);
    list('forms', audit.forms, (f) => `${f.method ?? 'get'} ${f.action}`);
    list('external links', audit.externalLinks);
  }
  console.log(out.join('\n'));
}
