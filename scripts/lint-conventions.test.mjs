#!/usr/bin/env node
// Regression cases for scripts/lint-conventions.mjs: false positives that pushed agents into
// lint-ignore comments, and true positives that must keep firing. Usage: bun run lint:test
import { lintText } from './lint-conventions.mjs';

// [name, file, source, expected rule ids (sorted, one per issue)]
const CASES = [
  // Bootstrap grid vs Tailwind grid
  [
    'tailwind grid placement',
    'src/x.astro',
    '<div class="col-span-2 col-start-1 col-end-3 col-auto">',
    [],
  ],
  [
    'bootstrap grid',
    'src/x.astro',
    '<div class="row"><div class="col col-6 col-md-4 col-lg-auto">',
    ['bootstrap', 'bootstrap', 'bootstrap', 'bootstrap', 'bootstrap'],
  ],
  ['responsive tailwind variant', 'src/x.astro', '<div class="md:col-span-2">', []],
  // Social links: profile roots are site constants, posts/videos are content
  [
    'facebook post link is content',
    'src/x.astro',
    '<a href="https://www.facebook.com/share/p/14aJaLfMf87/" target="_blank" rel="noopener">Early Life</a>',
    [],
  ],
  [
    'youtube video link is content',
    'src/x.astro',
    '<a href="https://www.youtube.com/watch?v=PGZpIYQo6Cs">video</a>',
    [],
  ],
  [
    'facebook profile root',
    'src/x.astro',
    '<a href="https://www.facebook.com/RooseveltAlumni">Facebook</a>',
    ['site-constant'],
  ],
  [
    'youtube channel handle',
    'src/x.astro',
    "const yt = 'https://www.youtube.com/@rooseveltalumni';",
    ['site-constant'],
  ],
  [
    'youtube embed is content',
    'src/x.astro',
    '<iframe src="https://www.youtube.com/embed/PGZpIYQo6Cs" title="x"></iframe>',
    [],
  ],
  // lint-ignore placement and syntax
  [
    'ignore above a Prettier-wrapped tag',
    'src/x.astro',
    '<!-- lint-ignore bootstrap: grid placement -->\n<div\n  id="x"\n  class="row text-ink"\n>\n</div>',
    [],
  ],
  [
    'ignore on the previous line',
    'src/x.astro',
    '<!-- lint-ignore inline-style: honeypot must stay off-screen -->\n<div style="position:absolute">',
    [],
  ],
  [
    'bare lint-ignore ignores nothing',
    'src/x.astro',
    '<div class="row"> <!-- lint-ignore: whatever -->',
    ['bootstrap'],
  ],
  [
    'ignore names a different rule',
    'src/x.astro',
    '<div class="row"> <!-- lint-ignore inline-style -->',
    ['bootstrap'],
  ],
  // Other false positives
  ['js index call in frontmatter', 'src/x.astro', '---\nconst r = fns[key](value);\n---', []],
  ['hex-like data attribute', 'src/x.astro', '<ul data-menu="#add"></ul>', []],
  ['numeric font weight', 'src/x.astro', '<p class="font-[650]">x</p>', []],
  // True positives that must keep firing
  [
    'font family arbitrary value',
    'src/x.astro',
    `<p class="font-['Georgia']">x</p>`,
    ['font-family'],
  ],
  ['raw hex colour', 'src/x.astro', '<style>p { color: #a99533; }</style>', ['hex-color']],
  ['inline style', 'src/x.astro', '<p style="color: red">x</p>', ['inline-style']],
  [
    'email literal in a page',
    'src/x.astro',
    '<p>Write to obituaries@rooseveltalumni.org</p>',
    ['site-constant'],
  ],
  ['local img', 'src/x.astro', '<img src="/images/a.png" alt="">', ['raw-img']],
  ['relative link', 'src/x.astro', '<a href="../about/board">Board</a>', ['relative-link']],
  [
    'blank without noopener',
    'src/x.astro',
    '<a href="https://x.org" target="_blank">x</a>',
    ['blank-noopener'],
  ],
  ['jquery', 'src/x.astro', '<script>$(".x").hide()</script>', ['jquery']],
  [
    'font cdn',
    'src/x.astro',
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display">',
    ['font-cdn'],
  ],
  ['legacy import', 'src/x.astro', "import x from '../../legacy/images/a.png';", ['legacy-import']],
  [
    'relative markdown link',
    'src/content/volunteerRoles/biowriter.md',
    'See [board](../about/board).',
    ['relative-link'],
  ],
  [
    'markdown image from public',
    'src/content/volunteerRoles/biowriter.md',
    '![x](/images/a.png)',
    ['raw-img'],
  ],
];

let failed = 0;
for (const [name, file, src, want] of CASES) {
  const got = lintText(file, src)
    .map((i) => i.rule)
    .sort();
  const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — want [${want}] got [${got}]`}`);
}
console.log(`\n${CASES.length - failed}/${CASES.length} lint rule cases pass`);
process.exit(failed ? 1 : 0);
