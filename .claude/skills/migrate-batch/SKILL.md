---
name: migrate-batch
description: Migrate a group of legacy RHSAA routes that share a phase or a content collection (e.g. "phase 2", "volunteerRoles"), building the shared template once and then each route. Use when asked to migrate a section, a phase, or many pages at once.
argument-hint: <phase N | collection name | space-separated routes>
---

# Migrate a batch: $ARGUMENTS

1. **Select routes** from `migration/status.json` with `status` of `todo` or `in-progress`
   matching the argument (`phase 2` → `phase == 2`; a collection name → `model == name`;
   or the explicit routes given). `bun run status` lists open routes with phase and model.
   Show the list and its size to the user before starting, then mark each with
   `bun run track <route> in-progress`.
2. **Preconditions** as in `migrate-page` step 0 (Phase 0/1 done, otherwise propose
   `/foundation`). Start the dev server once: `bunx astro dev status` → `bunx astro dev --background`.
3. **Shared template first.** If the routes share a collection/template, run ONE
   `legacy-analyst` over all of them to get the schema plus every entry's data. It writes
   `migration/briefs/<collection>.md`. Then run ONE `page-builder` with that path to build the
   collection, schema, dynamic route and listing pages. Example: `volunteerRoles` is 27 routes,
   25 role pages from one `src/pages/volunteer/[slug].astro` plus 2 listing pages,
   `/volunteer/` (public roles) and `/volunteer/restricted` (restricted roles; unlisted),
   filtered by `visibility`. The listing pages are not collection entries. Then run
   `parity-reviewer` per route. These reviews are independent and `bun run parity` is safe to
   run concurrently, so spawn them in parallel, at most 5 at a time.
4. **Independent pages** (different templates) → run the `migrate-page` procedure for each, one
   after another, so shared components created by the first page are reused by the next.
5. Apply the `migrate-page` fix loop (max 2 rounds) per failing route. When several routes
   fail on the same shared component, fix it once with one `page-builder` spawn and re-review
   all of them.
6. Save each verdict to `migration/reviews/<slug>.md` and record it with `bun run track`
   exactly as in `migrate-page` step 5. Run `bun run verify` once at the end and report a
   table: route | verdict | notes. Collect all owner questions in one list.

Stop early and report if Phase 0 isn't done or the same failure repeats across routes after a
shared fix (that means the template/component design needs rethinking).
