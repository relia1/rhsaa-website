---
name: migration-status
description: Summarise RHSAA migration progress from migration/status.json by phase and status, list open owner questions, and recommend the next step. Use at the start of a session or when asked what's left.
---

# Migration status

1. Run `bun run status` (prints counts by phase/status and the routes still open). If it
   prints a WARNING (the live site's branch moved past the `legacy/` snapshot) or the session
   start reported changes in `legacy/`, report that first.
2. Read `docs/DECISIONS.md → Open questions`.
3. Phase 0/1 state is in the status output (`layout: …`, `N/10 collections`).
   `bunx astro dev status` tells you whether the dev server is up.
4. Reply briefly:
   - progress line, e.g. `12/59 verified · 3 migrated · 1 in progress`
   - per phase: done / remaining
   - routes stuck in `migrated` (failed review) or `in-progress` (interrupted)
   - open questions that block routes
   - **next step**: the single most useful command. Order: `/foundation phase0` →
     `/foundation phase1` → `/migrate-batch volunteerRoles` → rest of phase 3 → phase 2 →
     phase 4 → cutover. Routes stuck in `migrated` come before new work: re-run
     `/migrate-page <route>` for them.
