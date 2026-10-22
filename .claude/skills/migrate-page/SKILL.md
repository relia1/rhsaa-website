---
name: migrate-page
description: Migrate one legacy RHSAA route to Astro end-to-end — analyst brief, build, independent parity review, fix loop, tracker update. Use when asked to migrate, port, or rewrite a specific legacy page.
argument-hint: <legacy-route e.g. /about/board>
---

# Migrate one route: $ARGUMENTS

You are the orchestrator. Delegate the work to the subagents. You own `migration/status.json`
and change it only through `bun run track` (never hand-edit the JSON).

## 0. Preconditions

- `bun run track <route>` prints the entry. If the route is unknown, it isn't a legacy page:
  stop and say so. If `status` is `verified`, ask before redoing it.
- If `src/layouts/BaseLayout.astro` doesn't exist, Phase 0 isn't done: stop and propose
  `/foundation phase0`. If the route's `model` collection isn't in `src/content.config.ts`
  and `src/content.config.ts` doesn't exist, propose `/foundation phase1`. If only that one
  collection is missing, the builder adds it, so make sure the brief covers the schema.
- `bun run track <route> in-progress`.
- Dev server: `bunx astro dev status`; if not running, `bunx astro dev --background` (required on
  Windows; never run it in the foreground).

Slug convention (briefs, reviews, parity output): route without leading/trailing `/`,
`/` → `__`, root = `home` (`/about/board` → `about__board`).

## 1. Brief — `legacy-analyst`

Spawn `legacy-analyst` with: the route and its tracker entry. It writes the brief to
`migration/briefs/<slug>.md` and returns a short summary with the open questions and tracker
lines. Don't copy the brief into other prompts; pass the path. If it lists **Open questions**
that block the page (e.g. whether to publish a page), ask the user now if they're present.
Otherwise record them (step 5) and continue with the most conservative choice: keep content,
keep the URL, and mark the page unlisted rather than dropping it (via `src/config/unlisted.mjs`).

## 2. Build — `page-builder`

Spawn `page-builder` with the brief path (`migration/briefs/<slug>.md`, which it reads) and the
target URL.

## 3. Review — `parity-reviewer`

Spawn `parity-reviewer` with the route and target. It has not seen the brief, which is
intentional. Save its final message verbatim to `migration/reviews/<slug>.md`; it must start
with the `VERDICT:` and `Route:` lines (`bun run track` checks both).

## 4. Fix loop (max 2 rounds)

On FAIL, spawn `page-builder` again with the brief path and the review path, then re-run
`parity-reviewer` (its `parity --review` run lists regressions since its previous run) and
overwrite the review file. After 2 failed rounds, stop and report the remaining issues to the
user instead of looping.

## 5. Record

- PASS → `bun run track <route> verified --review migration/reviews/<slug>.md`
- FAIL after 2 rounds → `bun run track <route> migrated --note "review FAIL: <short reason>"`
- Notes from the brief's `## Tracker` section and the review (owner questions, legacy typos,
  anything deferred) → `bun run track <route> --note "…"` (once per note). Pass a
  `--target` change too if the brief gives one, and add the redirect.

Add new open questions to `docs/DECISIONS.md → Open questions`, and an entry for any deviation
from `docs/ARCHITECTURE.md`.

Run `bun run verify`. It must pass before you finish.

## 6. Report

Tell the user in a few lines: route → URL, verdict, components/collections added, open
questions. Offer to commit as `migrate(<route>): <summary>`, including the review file (don't
commit unless asked or already agreed for this session).
