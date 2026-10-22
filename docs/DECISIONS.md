# Decision log

Short, dated records of decisions that shape the rewrite. Newest first. Agents add an entry
whenever they deviate from `docs/ARCHITECTURE.md` or resolve an open question.

Format:

```
## YYYY-MM-DD — Title
Status: accepted | proposed | superseded by …
Context: why it came up.
Decision: what we chose.
Consequences: what it changes.
```

---

## 2026-10-21 — Hosting, domain, branches and legacy URLs

Status: accepted (owner)
Context: Open questions on host, domain, `*.html` URLs, branches, CI, `/403` and the 2022
`*.php` URLs blocked the build config and cutover plan (RHSWEB-3).
Decision:

- Host: AWS Amplify, as for V1. Canonical domain `https://www.rooseveltalumni.org`; the bare
  domain redirects to www.
- `build.format: 'preserve'` (supersedes `directory` from 2026-10-12): emits legacy's file
  layout so both `/about/sota` and `/about/sota.html` keep working with no redirects.
- Branches: keep version branches. v2 deploys from `v2.0.0`; `v1.0.0` stays untouched as the
  rollback target (switch Amplify's production branch back).
- CI: none. `bun run verify` is run manually before pushing.
- `/403` is kept and migrated like legacy.
- 2022-era `*.php` URLs (e.g. `/about/board.php`) get 301s to the new pages via Amplify
  rewrites/redirects, not `redirects.mjs`.
  Consequences: `astro.config.mjs` uses the www `site` and `preserve`. Amplify settings (Bun
  build, 404 rewrite, www and `*.php` 301s) are configured in the AWS console at cutover
  (`MIGRATION_PLAN.md → Phase 5`).

## 2026-10-20 — Unlisted pages may link to each other; listed pages may not link to them

Status: accepted (owner)
Context: 8 legacy role pages link back to the unlisted `/volunteer/restricted` ("Return to
Restricted Volunteer Page"). Three of them are unlisted themselves (picnicdayof,
scholarshipadmin, studentrepmentor); five are listed (decaderep, newspaperliaison, rosesteward,
staffliaison, volunteercoordinator). The rule "no inbound links" would have failed all eight.
Decision: Unlisted pages keep their legacy links, including links to other unlisted pages.
Listed routes (anything not in `src/config/unlisted.mjs`) must not link to unlisted ones.
Consequences: `bun run links` only flags links to an unlisted page from a listed page. The five
listed role pages' back-links can't be migrated as-is (open question below).

## 2026-10-20 — Tooling review fixes before Phase 0

Status: accepted
Context: A review of the agent tooling found checks that could never pass (nav links to
unmigrated pages, `/404`'s status, saved verdicts vs Prettier) and checks that gave wrong
answers on Windows or against the dev server.
Decision:

- `bun run links` lists links to tracker routes still `todo`/`in-progress` as pending (not
  failures), ignores redirect stubs as linking pages, and warns about built images > 600 KB.
- `bun run parity` expects HTTP 404 for `/404`, matches dev-server (`/_image`) and `<Picture>`
  images, reports failed requests (legacy screenshots need CDNs), hides the dev toolbar, writes
  readable tiles, and with `--review` lists regressions since the reviewer's previous run.
- `bun run track … verified` requires the review's first line to be `VERDICT: PASS` and its
  `Route:` line to name the route.
- `legacy/` safety net: `bun run legacy:check` (git status) is the first step of `verify` and
  runs at session start; the PreToolUse guard fails closed and no longer trips on `=>` or
  `LEGACY` identifiers.
- One PostToolUse hook formats, then lints, so lint line numbers match the formatted file.
  Hooks use exec form (`command` + `args`), which needs no shell.
- Lint: Tailwind `col-span/start/end/auto` allowed; only social-profile roots count as site
  constants; `lint-ignore` needs a rule id and works above a wrapped tag (`bun run lint:test`).
- Tailwind scans only `src/`. Windows paths fixed in the audit and status scripts.
- `legacy-analyst` writes briefs to `migration/briefs/` (gitignored); `legacy:extract` appends the
  route's audit record.
  Consequences: No new dependencies. `migration/reviews/`, `migration/briefs/` and the generated
  audit are excluded from Prettier.

## 2026-10-14 — Agent tooling: convention lint, tracker CLI, Astro docs MCP

Status: accepted
Context: Before the first page is migrated, the agent workflow needed hardening for this
Windows/PowerShell setup and for many parallel subagents.
Decision:

- `bun run lint` (`scripts/lint-conventions.mjs`) mechanically checks the hard rules a regex
  can see; it is part of `bun run verify` and runs as a hook on every file Claude writes.
- `bun run track` is the only way to change `migration/status.json`; `verified` requires a
  saved PASS verdict in `migration/reviews/<slug>.md`.
- The `astro-docs` MCP server (`.mcp.json`) is the reference for Astro 7 APIs; builder and
  analyst agents query it instead of relying on memory.
- `/foundation` + `foundation-builder` drive Phases 0–1; the legacy guard also covers the
  PowerShell tool; parity runs can run concurrently.
  Consequences: No new dependencies. Lint false positives are handled with a justified
  `lint-ignore <rule>` comment that reviewers check; if a rule proves wrong, fix the rule.

## 2026-10-12 — Self-host Playfair Display

Status: accepted (owner)
Context: Legacy loads Playfair Display (weight 400 only) from Google Fonts.
Decision: Self-host via Astro's Fonts API, local provider, files from
`@fontsource-variable/playfair-display` (variable 400–900, normal + italic, Latin + Latin-ext).
Only normal-style files are preloaded; Latin-ext is fetched by the browser only if a page uses
those characters (no legacy text does today).
Consequences: No third-party font requests (privacy, no Google dependency); offline builds;
real bold instead of synthesized bold, so bold text looks slightly heavier than legacy.

## 2026-10-12 — Orphan pages stay published but unlisted

Status: accepted (owner)
Context: 9 legacy pages had no inbound links: `/studentrep`, `/volunteer/athleticdata`,
`/volunteer/digitalhistory`, `/volunteer/graphicdesigner`, `/volunteer/picnicdayof`,
`/volunteer/scholarshipadmin`, `/volunteer/socialmediaassistant`,
`/volunteer/studentrepmentor`, `/volunteer/yearbookarchivist`.
Decision: Migrate them, keep their URLs, keep them unlisted: noindex, excluded from the
sitemap, not linked from any page. `/volunteer/restricted` (hidden on purpose in legacy) gets
the same treatment. Source of truth: `src/config/unlisted.mjs`; enforced by `bun run links`.
Consequences: Anyone with a direct link (emails, flyers) still reaches them; search engines and
site visitors browsing the nav don't.

## 2026-10-12 — Keep legacy URLs, directory build output

Status: accepted; build format superseded by 2026-10-21 (`preserve`)
Context: The legacy site is static HTML served as `/section/` and `/section/page`, with external
links, newsletters and social posts pointing at those URLs.
Decision: `build.format: 'directory'`, `trailingSlash: 'ignore'`, one route per legacy page at the
same path. URL changes require a redirect in `src/config/redirects.mjs`.
Consequences: No SEO or bookmark breakage; parity checks can compare routes 1:1.

## 2026-10-12 — No client-side framework, no jQuery/Bootstrap

Status: accepted
Context: Legacy loads jQuery twice, Popper and Bootstrap JS only for header includes and menus.
Decision: Astro components + Tailwind; header/footer are components; menu behaviour is a small
inline script or `<details>`.
Consequences: Zero JS frameworks shipped; behaviour must be keyboard-accessible.

## 2026-10-12 — Images through astro:assets

Status: accepted
Context: `legacy/images` is ~337 MB; 107 files exceed 1 MB (hero PNGs up to 13 MB).
Decision: Copy images used by migrated pages into `src/assets/<legacy-folder>/` and render with
`<Image>`/`<Picture>` so Astro emits resized WebP/AVIF. PDFs go to `public/pdf/`.
Consequences: Large page-weight reduction; image filenames stay recognisable for parity checks.

## Open questions (owner to decide)

- **Listed role pages linking to `/volunteer/restricted`.** Under the 2026-10-20 rule, the
  "Return to Restricted Volunteer Page" link can't stay on the five listed restricted-role
  pages (decaderep, newspaperliaison, rosesteward, staffliaison, volunteercoordinator). Drop the
  link there, or make those pages unlisted too? Related: should restricted-role pages (linked
  only from the unlisted restricted page) be in the sitemap and indexable?
- **Live-site changes during the migration.** Freeze `v1.0.0`, or re-sync `legacy/` and reopen
  affected routes (procedure in `MIGRATION_PLAN.md → Legacy source`)?
- **Mailchimp signup jQuery.** Accept `mc-validate.js` (bundles jQuery) and its inline
  `jQuery.noConflict` script as the one exception to "no jQuery" (with `lint-ignore jquery`)?
- **Duplicate titles.** `/volunteer/picnicdayof` = `/volunteer/picnicvolunteercoord`,
  `/about/sota` = `/about/sota2025`, `/403` = `/404`. Keep identical to legacy or make unique?
- **Review cost.** Pin `parity-reviewer` and `legacy-analyst` to a smaller model (subagents
  inherit the session model)? For the 25 template-driven role pages, full screenshot review on
  ~3 representative routes (public, restricted, unlisted) and text/link/lint review on the rest?
- **New dev tooling (new dependency).** `@axe-core/playwright` for the Phase 5 accessibility
  pass? (CI decided 2026-10-21: none.)
- **`bootstrap@4.1.1` devDependency** is unused by any script: remove it, or use it in parity to
  serve Bootstrap CSS locally when the CDN is unreachable (partial fix: legacy still needs
  jQuery from a CDN for its header/footer)?
- Missing asset: `images/headers/fiftyhead.png` (referenced by unused `.photofifty`).
- Princess history cards carry names only inside the images; alt text must be written.
