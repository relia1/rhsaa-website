# Migration plan: legacy static site → Astro

Source: `legacy/` — 59 hand-written HTML pages (Bootstrap 4 + jQuery includes), one 926-line
stylesheet, 384 assets (~337 MB). Tracker: `migration/status.json`. Facts below come from
`bun run legacy:audit` (re-run it if `legacy/` changes).

## Legacy source

`legacy/` is a copy of branch `v1.0.0` at `d227423` (2026-10-06), the live site. (`main` is an
older 2022 PHP version of the site; don't migrate from it.) The commit is recorded in
`migration/status.json → legacySource`, and `bun run status` warns when `origin/v1.0.0` has
moved on after a `git fetch`. If the live site changes during the migration, the owner decides
whether to bring the change into `legacy/`. If so, the owner (not an agent) re-copies it and
updates `legacySource`. Then run `bun run legacy:audit` and reopen the affected routes with
`bun run track <route> in-progress --note "legacy changed"`.

## Legacy facts that shape the work

- **Shared chrome via jQuery.** Every page loads `includes/header.html` and `includes/footer.html`
  with `$.load()`. Becomes `Header.astro` / `Footer.astro`. Desktop has hover dropdowns, mobile
  has a collapsible menu with nested lists.
- **28 hero variants.** `.photohome`, `.photoabout`, … each set a background image in CSS. One
  `Hero` component with an `image` prop replaces all of them. Map in `legacy-audit.json → heroes`.
- **Mixed encodings.** 26 pages are Windows-1252 (curly quotes show as `�` if read as UTF-8).
  Always read legacy through `bun run legacy:extract` / `scripts/lib/legacy.mjs`, never raw.
- **Invalid HTML.** `</br>`, unclosed tags, `&amp` without `;`, stray `target` duplicates.
  Astro 7's Rust compiler errors on unclosed tags — never paste legacy markup; rebuild it.
- **Repeating structures** (cards of people, yearly lists, role pages) → content collections.
- **Third-party embeds:** Mailchimp signup (contact), Mailchimp archive script (news), PayPal
  hosted buttons (donate ×3), YouTube (memorials).
- **Huge images.** 107 assets > 1 MB; heroes up to 13 MB PNG. All go through `astro:assets`.
- **Unlisted pages:** the 9 pages legacy never linked + `/volunteer/restricted` are migrated
  as published-but-unlisted (`src/config/unlisted.mjs`, see ARCHITECTURE.md).
- **Oddities:** 23 unreferenced assets, one missing hero image,
  duplicate titles — listed in `docs/DECISIONS.md → Open questions`. Don't drop anything
  without the owner's decision; mark it `dropped` in the tracker only after.

## Phases

Each phase ends with `bun run verify` green and the tracker updated. Phases 2–4 can run page
by page in parallel once Phase 0–1 are merged.

### Phase 0 — Foundation (one PR, do first, sequentially)

1. `src/config/site.ts`: name, nav tree (from `includes/header.html`), social links, contact
   emails, mailing address, PayPal button ids, Mailchimp ids.
2. Fonts: already configured (self-hosted Playfair Display via the Fonts API). BaseLayout
   must render `<Font>` as in the placeholder index page.
3. `BaseLayout` (SEO head, `<Font>`, automatic noindex for unlisted routes via
   `isUnlisted()`, favicon from `images/common/tab2.ico`; delete the starter
   `public/favicon.svg`, which is the Astro logo), `Header`, `Footer`, `Hero` (a `<Picture>`
   with `widths`/`sizes`: hero sources are up to 13 MB), `PageLayout`, `Section`, `Callout`,
   `Card`, `CardGrid`, `BackLink`. The header links to every nav route right away;
   `bun run links` reports links to routes not migrated yet as pending, not as failures.
4. `src/pages/404.astro` (parity expects it to answer HTTP 404); decide on `/403`.
5. Copy `legacy/images/common/` and `legacy/images/headers/` into `src/assets/`.
6. Replace the starter `src/pages/index.astro` with a placeholder using `PageLayout`.
7. Verify header/footer against legacy screenshots at 390/768/1280 px (`bun run parity /`;
   read the numbered tiles).

### Phase 1 — Content model

1. Write `src/content.config.ts` with all collections in `docs/ARCHITECTURE.md`.
2. For each collection, extract **one** representative entry from legacy to prove the schema;
   `bun run check` must pass.
3. Record any schema decisions in `docs/DECISIONS.md`.

### Phase 2 — Simple pages (13 routes, `phase: 2` in tracker)

Prose pages with little repetition: `/`, `/about/`, `/about/bylaws`, `/about/boardpolicy`,
`/about/studentduties`, `/events/rhs`, `/grants/`, `/history/`, `/history/coatofarms`,
`/history/fallenalumnimemorial`, `/scholarships/`, `/scholarships/verboutaward`, `/studentrep`.
Long prose (bylaws) may live in Markdown under `src/content/pages/` rendered by the route.

### Phase 3 — Collection-driven pages (39 routes)

Volunteer roles (27 routes: 25 role pages from one dynamic route, plus the `/volunteer/` and
`/volunteer/restricted` listing pages), board, committees, SOTA reports (3), grant recipients,
scholarship recipients, principals, princesses, events, reunions, links.
Do the volunteer collection first: highest page count, simplest schema. Recommended order
overall (as `/migration-status` suggests): volunteer roles → rest of Phase 3 → Phase 2 →
Phase 4. Collection pages first means shared components (Card, PersonCard) exist before the
prose pages.

### Phase 4 — Embeds & forms (5 routes)

`/contact/`, `/news/`, `/donate/`, `/donate/megansletter`, `/history/memorials`.
Manually confirm the Mailchimp form posts and the PayPal buttons open the right campaign.

### Phase 5 — Cutover

- Legacy `*.html` URLs (`/about/sota.html`, `/about/index.html`): handled by
  `build.format: 'preserve'` (decided 2026-10-21), which emits legacy's exact file layout, so
  on Amplify both `/about/sota` and `/about/sota.html` keep working with no redirects.
  **Not** through `redirects.mjs`: without an adapter, Astro writes a meta-refresh page per
  redirect, not an HTTP 301, and a key like `/about/index.html` collides with the real page.
- Amplify (AWS console): production branch `v2.0.0` (rollback: switch back to `v1.0.0`), Bun
  build settings (`bun install`, `bun run build`, output `dist/`), bare domain → `www` 301,
  custom 404 rewrite to `/404.html`, and 301 rules for the 2022 `*.php` URLs (list from the old
  `main` branch, e.g. `/about/board.php` → `/about/board`).
- `redirects.mjs` holds only routes whose URL changed. `bun run status` flags keys that would
  break the build.
- Sitemap already excludes unlisted pages; also exclude drafts; add `robots.txt`.
- Full-site parity sweep: every route `verified` in the tracker.
- Lighthouse/axe pass on a sample of each page type.
- DNS, then archive `legacy/`.

## Definition of done for one route

- [ ] Route builds at its `target` URL; legacy URL redirects if different.
- [ ] `bun run parity <route>` passes: no missing sentences or images, correct HTTP status,
      one `<h1>`. Missing links are listed, not failed: the reviewer checks each one.
- [ ] Screenshots reviewed at mobile/tablet/desktop — same information, same order,
      recognisably the same design.
- [ ] Structured content lives in a collection; page file is thin.
- [ ] Images via `astro:assets` with real alt text.
- [ ] One `<h1>`, no heading skips, correct `<title>` and description.
- [ ] `bun run lint` clean (any `lint-ignore` has a reason the reviewer accepted).
- [ ] `bun run verify` green.
- [ ] Reviewer verdict saved to `migration/reviews/<slug>.md`; tracker updated with
      `bun run track` (`verified` only with `--review` pointing at a PASS verdict), with
      notes for anything the owner must decide.
