# RHSAA website — agent instructions

Roosevelt High School Alumni Association (Portland, OR) website, version 2.0.0: a rewrite of the
static Bootstrap/jQuery site in `legacy/` into Astro 7 + Tailwind CSS v4 + TypeScript.
This file is shared by all coding agents (`CLAUDE.md` is a symlink to it). The final section
describes the Claude Code subagent/skill workflow in `.claude/`; other agents can follow the
same steps manually.

## Read before working

- `docs/ARCHITECTURE.md` — stack, directory layout, content model, conventions. **Binding.**
- `docs/MIGRATION_PLAN.md` — phases and the per-route definition of done.
- `docs/DECISIONS.md` — decisions made and open questions for the owner.
- `migration/status.json` — which legacy routes are todo / in-progress / migrated / verified.

## Hard rules

1. **`legacy/` is read-only.** Never edit, move, delete, or format anything in it. It is the
   source of truth for content until cutover. (A hook blocks obvious writes for Claude;
   `bun run legacy:check`, the first step of `verify`, fails if anything in it changed.)
2. **Copy is verbatim.** Migrate legacy text word-for-word. Only fix encoding mojibake and broken
   markup. Record suspected typos in the route's `notes` in `migration/status.json`.
3. **Never paste legacy HTML.** Rebuild with components + Tailwind. No Bootstrap classes
   (`row`, `col-*`, `card-body`…), no jQuery, no inline `style=""`.
4. **Read legacy pages through the scripts**, not raw: 26 files are Windows-1252.
   `bun run legacy:extract <route>` gives clean structured text.
5. **Keep URLs.** Same path as legacy unless the tracker says otherwise; then add a redirect in
   `src/config/redirects.mjs`.
6. **No hard-coded site constants** (emails, PayPal/Mailchimp ids, social links, address, nav):
   they live in `src/config/site.ts`.
7. **Images go through `astro:assets`** from `src/assets/…` with meaningful `alt`.
8. **Don't decide for the owner.** Dropping pages, changing wording, design changes beyond the
   cleanup in ARCHITECTURE.md, or new dependencies → ask, or add to Open questions in DECISIONS.md.
9. A route is only `verified` after an independent parity review, not by the agent that built it.
10. **Unlisted pages stay unlisted.** Routes in `src/config/unlisted.mjs` are published but get
    noindex, no links from listed pages and no sitemap entry. Unlisted pages may keep their
    legacy links to each other. `bun run links` enforces this.
11. **Fonts are self-hosted.** Use `font-display`/`font-body`; never link Google Fonts or another
    font CDN (see ARCHITECTURE.md → Fonts).

## Commands

All from the repo root. Bun is the package manager.

| Command                                   | What it does                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `bun install`                             | Install dependencies                                                            |
| `bunx astro dev --background`             | Start dev server on :4321 in the background (`bunx astro dev stop/status/logs`) |
| `bun run build`                           | Static build to `dist/`                                                         |
| `bun run check`                           | `astro check` — TypeScript + content schema validation                          |
| `bun run format` / `format:check`         | Prettier (Astro + Tailwind class sorting)                                       |
| `bun run lint`                            | Convention lint of `src/` (hard rules 3, 6, 7, 11, links, noopener)             |
| `bun run lint:test`                       | Regression cases for the lint rules (run after changing them)                   |
| `bun run links`                           | After build: broken links, route coverage, unlisted rules, image-weight warning |
| `bun run legacy:check`                    | Fails if anything in `legacy/` differs from the last commit                     |
| `bun run verify`                          | legacy:check → format:check → lint → check → build → links. **Must pass.**      |
| `bun run status`                          | Tracker summary by phase + open routes                                          |
| `bun run track <route> [status] [--note]` | Update the tracker (`verified` needs `--review <file>`); never hand-edit        |
| `bun run legacy:serve`                    | Serve legacy as-is on :4322                                                     |
| `bun run legacy:extract <route> [--json]` | Clean content of one legacy page, plus its record from the audit                |
| `bun run legacy:audit`                    | Regenerate `migration/legacy-audit.json`                                        |
| `bun run parity <route> [--target <new>]` | Legacy vs new: missing text/images/links + screenshots (needs dev server)       |

Playwright uses the system Chromium at `/opt/pw-browsers/chromium` when present; elsewhere run
`bunx playwright install chromium` once.

Exceptions to the lint: a `lint-ignore <rule>` comment on the same or previous line (or above
the start of a multi-line tag), with a reason. A rule id is required. Reviewers check every one.

**Windows:** Astro only auto-backgrounds the dev server for agents on macOS/Linux, so always pass
`--background` (`bunx astro dev --background --force` restarts it; readiness: `GET /_astro/status`).
Git Bash rewrites `/about/board` into `C:/Program Files/Git/about/board` for native programs;
the scripts undo this, but prefer PowerShell or `MSYS_NO_PATHCONV=1` for other tools.

## Astro 7 notes

- Rust compiler: unclosed or mis-nested tags are **build errors** (legacy is full of `</br>`).
- `compressHTML` defaults to `'jsx'`: whitespace between inline elements can vanish — add `{" "}`.
- Default Markdown processor is Sätteri; remark/rehype plugins need `@astrojs/markdown-remark`.
- Content collections: `src/content.config.ts`, loaders from `astro/loaders`, `z` from `astro/zod`.
- Third-party scripts that must run as-is need `<script is:inline>`.

## Documentation

Astro 7 is recent; don't rely on remembered APIs. Claude Code has the **Astro docs MCP**
(`astro-docs`, configured in `.mcp.json`): search it before using an Astro API that isn't
already used in `src/`, and for any Astro error message. Other agents: add
`https://mcp.docs.astro.build/mcp` to your MCP config, or use the links below.

Full documentation: https://docs.astro.build — consult before related work:

- [Routing, dynamic routes](https://docs.astro.build/en/guides/routing/)
- [Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Images](https://docs.astro.build/en/guides/images/)
- [Styling & Tailwind](https://docs.astro.build/en/guides/styling/)
- [Upgrade to v7](https://docs.astro.build/en/guides/upgrade-to/v7/)
- [Tailwind v4 theme variables](https://tailwindcss.com/docs/theme)

## Claude Code workflow

The migration runs as a loop of three subagents, driven by skills in `.claude/skills/`.

| Skill                                | Use it to                                                             |
| ------------------------------------ | --------------------------------------------------------------------- |
| `/migration-status`                  | See progress by phase and what to do next                             |
| `/foundation <phase0\|phase1>`       | Build layout + shared components, then the content collections        |
| `/migrate-page <route>`              | Migrate one legacy route end-to-end: analyse → build → review → track |
| `/migrate-batch <phase\|collection>` | Migrate several routes in order (e.g. `phase 2`, `volunteerRoles`)    |
| `/verify-site`                       | Run the full check suite and triage failures                          |
| `/add-content <type>`                | After launch: add a grant, recipient, volunteer role, SOTA year, …    |

| Subagent (`.claude/agents/`) | Role                                                             | Writes code? |
| ---------------------------- | ---------------------------------------------------------------- | ------------ |
| `foundation-builder`         | Phase 0/1: site config, layouts, chrome, components, schemas     | Yes          |
| `legacy-analyst`             | Reads a legacy page; writes a migration brief with exact content | No (brief)   |
| `page-builder`               | Implements the route from the brief with shared components       | Yes          |
| `parity-reviewer`            | Independently checks the result against legacy; PASS/FAIL        | No           |

- The orchestrating session owns `migration/status.json` and changes it only with
  `bun run track`; subagents never set `verified`. Reviewer verdicts are saved to
  `migration/reviews/<slug>.md` and are required evidence for `verified`.
- `legacy-analyst` writes its brief to `migration/briefs/<slug>.md` (gitignored). Pass that
  path to builders; don't paste the brief into prompts.
- Hooks (`.claude/settings.json`): `protect-legacy` blocks writes to `legacy/` from
  Write/Edit/Bash/PowerShell (fails closed if the hook itself errors); `post-write` formats each
  file written under `src/`, `docs/` or `scripts/`, then lints `src/` files (violations are
  shown to Claude immediately); `session-start` injects the tracker summary and warns if
  `legacy/` has changed.
- A session starts with the tracker summary in context; use `/migration-status` for the
  next step instead of re-exploring `legacy/`.
- Phase 0 (layout + shared components) comes before any page. If
  `src/layouts/BaseLayout.astro` doesn't exist, run `/foundation phase0` first.
- Run the dev server with `bunx astro dev --background`, never in the foreground.
- One route (or one collection template) per commit: `migrate(<route>): <summary>`;
  foundation work `feat(layout): …`, tooling `chore(tooling): …`.
- If an open question blocks a route, add it to `docs/DECISIONS.md → Open questions`, note it in
  the tracker, and move on to the next route.
