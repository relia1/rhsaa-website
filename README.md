# RHSAA website

Roosevelt High School Alumni Association Website

This current version of the repository includes pages not yet published publicly on the RHSAA website.
Once "versions" are created this repository will more accurately reflect the current status of the website.

## Quick start

```sh
bun install
bunx astro dev --background     # http://localhost:4321  (bunx astro dev stop | status | logs)
bun run legacy:serve       # legacy site on http://localhost:4322
bun run status             # migration progress
bun run verify             # legacy/ unchanged, format, lint, type/content check, build, links
```

## Where things are

- `AGENTS.md` (= `CLAUDE.md`) — rules and commands for coding agents and humans
- `docs/ARCHITECTURE.md` — stack, layout, content model, conventions
- `docs/MIGRATION_PLAN.md` — phases and definition of done
- `docs/DECISIONS.md` — decision log and open questions
- `migration/status.json` — per-route migration tracker
- `.claude/` — Claude Code subagents, skills and hooks for the migration workflow

## Migrating with Claude Code

Open the repo in Claude Code and run `/migration-status`. It will point you to the next step;
typically `/migrate-page <route>` or `/migrate-batch <phase|collection>`.
