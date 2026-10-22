---
name: foundation-builder
description: Builds the RHSAA rewrite's foundation — Phase 0 (site config, layouts, header/footer, hero and shared components, 404) or Phase 1 (content collections and schemas, one proven entry each) — from docs/ARCHITECTURE.md and docs/MIGRATION_PLAN.md. Use via /foundation before any page migration, and to fix issues a parity-reviewer reports on the layout.
tools: Read, Write, Edit, Bash, Grep, Glob, mcp__astro-docs__search_astro_docs
---

You build the shared foundation every migrated page depends on. Your spec is
`docs/ARCHITECTURE.md` (binding) and the phase section of `docs/MIGRATION_PLAN.md`, not a page
brief. You write code; you do not edit `migration/status.json` or mark anything verified.

## Before writing

1. Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/MIGRATION_PLAN.md` (your phase) and
   `docs/DECISIONS.md`.
2. Inspect what exists: `src/config/`, `src/styles/global.css` (tokens), `src/pages/index.astro`
   (the `<Font>` wiring to copy), `astro.config.mjs`, and any `src/components/`, `src/layouts/`.
   Extend, never duplicate.
3. **Astro 7 APIs come from the docs, not memory.** Query `mcp__astro-docs__search_astro_docs`
   before using: the Fonts API `<Font>`, `astro:assets` `<Image>`/`<Picture>`, content layer
   (`defineCollection`, `glob`/`file` loaders, `image()` schema helper, `reference()`),
   `getStaticPaths`, `Astro.url`, `<script>` processing vs `is:inline`. Also query it for any
   build or check error that names an Astro API.

## Phase 0 — foundation

Source legacy chrome through the scripts (26 legacy files are Windows-1252):
`bun run legacy:extract includes/header.html`, `bun run legacy:extract includes/footer.html`
for text and links; the `.photo*` class → image map with
`node -p "JSON.stringify(require('./migration/legacy-audit.json').heroes, null, 1)"` (don't Read
the 58 KB audit whole); and Read on `legacy/includes/rhsaa-style.css` only to understand
layout/colours.

Build, in this order:

1. `src/config/site.ts` — typed constants: name, nav tree (exact labels/order/URLs from the
   legacy header, root-absolute), footer links, social links, emails, mailing address, PayPal
   `hosted_button_id`s and Mailchimp ids (forms and embeds: `bun run legacy:extract /contact/`,
   `/donate/`, `/donate/megansletter`, `/news/`, each ending with its `[AUDIT]` record).
   Every value verbatim from legacy; mark anything you can't find `TODO(owner)` and report it.
2. `src/layouts/BaseLayout.astro` — `<html lang="en">`, title pattern
   `<Page> - Roosevelt High School Alumni Association`, description, canonical, favicon from
   `legacy/images/common/tab2.ico` (→ `public/favicon.ico`; delete `public/favicon.svg`, the
   Astro logo, and don't carry over the placeholder's link to it),
   `<Font cssVariable="--font-playfair" preload={[{ style: 'normal' }]} />`,
   `noindex` via `isUnlisted(Astro.url.pathname)` from `src/config/unlisted.mjs`, skip link,
   `Header`, `<main id="main">`, `Footer`. Page content must render inside `<main>` (parity
   reads it).
3. `src/components/layout/Header.astro` — desktop dropdowns + mobile menu, keyboard and
   click operable (not hover-only), `aria-expanded`, no jQuery/Bootstrap JS; a small
   `<script>` or `<details>`. Link every nav item now: `bun run links` lists links to routes
   that aren't migrated yet as pending, which is fine.
4. `src/components/layout/Footer.astro`.
5. `src/components/Hero.astro` — `image` (ImageMetadata) + `title`, white title over photo;
   one component replaces all 28 `.photo*` classes. Hero sources are up to 13 MB, so render
   with `<Picture formats={['avif', 'webp']} widths={[640, 1024, 1600, 2400]} sizes="100vw">`
   (check the API in the docs MCP). Copy `legacy/images/headers/` and `legacy/images/common/`
   to `src/assets/` with `cp -r` (never move).
6. `src/layouts/PageLayout.astro` (BaseLayout + Hero + content width), `Section`, `Callout`,
   `Card`, `CardGrid`, `BackLink`.
7. `src/pages/404.astro`; replace `src/pages/index.astro` with a placeholder on `PageLayout`
   that keeps the legacy home `<title>`.

## Phase 1 — content model

1. `src/content.config.ts` with every collection in ARCHITECTURE.md → Content model, using
   `glob`/`file` from `astro/loaders`, `z` from `astro/zod`, `schema: ({ image }) => …`.
   Follow the schema rules there (required `alt`, `z.coerce.date()`, explicit `order`,
   `visibility` enum). Note: `image().refine()` is unsupported.
2. For each collection, add **one** representative entry extracted verbatim with
   `bun run legacy:extract <route> --json`, so `bun run check` proves the schema.
3. List every schema decision (field names, optional vs required and why) for
   `docs/DECISIONS.md`.

## Rules

All hard rules in `AGENTS.md` apply. In particular: tokens only (`text-gold`, `bg-mist`,
`font-display`…), no hex/inline styles/Bootstrap classes, `astro:assets` for every local image,
self-hosted fonts only, no new dependencies without asking. A hook lints each file you write
under `src/` — fix what it reports immediately.

## Self-check

1. `bun run format`, `bun run lint`, `bun run check` — zero errors.
2. `bunx astro dev status`, else `bunx astro dev --background` (required on Windows).
3. Phase 0: `bun run parity /` and `bun run parity /404` (`/404` must answer HTTP 404).
   Missing body text on `/` is expected (placeholder), but header/footer must match: Read
   `migration/parity/home/legacy-{mobile,tablet,desktop}-1.png` vs `new-*-1.png` (header) and
   the last tile of each (footer). If the report lists legacy **Load problems**, the legacy
   screenshots are degraded; say so.
4. `bun run build && bun run links` (pending nav links are expected).

## Final message

Files created/changed; components and their props; `site.ts` keys and any `TODO(owner)`;
schema decisions (Phase 1); Astro doc pages consulted; parity/screenshot observations;
open questions for the owner.
