---
name: foundation
description: Build the RHSAA rewrite's foundation before any page is migrated — Phase 0 (site.ts, BaseLayout/PageLayout, Header, Footer, Hero, shared components, 404) or Phase 1 (content.config.ts with all collections, one proven entry each). Use when /migration-status says layout or content model is not done, or when asked to set up the layout, header/footer, or content collections.
argument-hint: <phase0 | phase1>
---

# Foundation: $ARGUMENTS

You are the orchestrator. `foundation-builder` writes the code; `parity-reviewer` checks it.
Do Phase 0 before Phase 1, and both before `/migrate-page`. With no argument, pick the first
phase that `bun run status` reports as not done.

## Phase 0 — layout and shared components

1. Preconditions: `bun run status` shows `layout: not started` or partial. If
   `BaseLayout.astro` already exists, only fill the gaps it lists.
2. `bun run track /404 in-progress`.
3. Spawn `foundation-builder`: "Phase 0. Build everything in MIGRATION_PLAN.md → Phase 0 that
   is missing: <list from status>. Return the full final report."
4. Start the dev server once if needed (`bunx astro dev status` → `bunx astro dev --background`).
5. Spawn `parity-reviewer` for `/404` (a real route; it must answer HTTP 404) and, separately,
   a layout review of `/`: tell it that `/` is a placeholder, so judge only header, nav
   (desktop dropdowns and mobile menu, keyboard), footer, hero and fonts at the three widths,
   plus lint and conventions. Run both reviews in parallel. Nav links to pages not migrated
   yet are expected (`bun run links` lists them as pending).
6. Fix loop: on FAIL, spawn `foundation-builder` with the blocking list (max 2 rounds), then
   review again.
7. Record: save the `/404` verdict to `migration/reviews/404.md`, then
   `bun run track /404 verified --review migration/reviews/404.md` on PASS
   (`migrated` after 2 failed rounds). Ask the owner about `/403` if it's still undecided
   (DECISIONS.md → Open questions); don't build it on your own.
8. Add `TODO(owner)` values from `site.ts` to DECISIONS.md → Open questions.

## Phase 1 — content model

1. Precondition: Phase 0 done (`bun run status` → `layout: done`).
2. Spawn `foundation-builder`: "Phase 1. Write src/content.config.ts with every collection
   in ARCHITECTURE.md → Content model and one verbatim entry per collection. Return schema
   decisions."
3. `bun run check` must pass. Read the schemas yourself against ARCHITECTURE.md → Schema
   rules (required `alt`, coerced dates, explicit order, visibility enum). If anything is
   off, send it back once.
4. Add a dated `docs/DECISIONS.md` entry summarising the schema decisions.

## Finish

Run `bun run verify` (must pass). Report in a few lines: what was built, review verdicts,
owner questions. Offer commits: `feat(layout): …` for Phase 0 and `feat(content): …` for
Phase 1 (commit only if asked or already agreed). Next step: `/migrate-batch volunteerRoles`.
