---
name: verify-site
description: Run the RHSAA site's full verification (format, convention lint, astro check, build, link and route coverage) and triage failures. Use before finishing any change, before committing, or when asked to check the build.
---

# Verify the site

1. Run `bun run verify` (legacy:check → format:check → lint → astro check → build → links).
2. On failure, fix in this order and re-run:
   - **legacy:check** → something changed `legacy/`, which is read-only. Don't fix it yourself:
     stop and show the user the listed files (it prints the restore command).
   - **format:check** → `bun run format` (never format `legacy/`; it's in .prettierignore).
   - **lint** → each line is `file:line [rule] message`. Fix the code: use tokens instead of
     hex values, `<Image>` instead of `<img>`, `site.ts` constants, root-absolute links, and
     so on. Add `lint-ignore <rule>` (with a reason in the same comment) only when the rule
     is genuinely wrong for that line, and mention it in your report.
   - **astro check** → type or content-schema errors; the message names the entry file and field.
     Fix the data or the schema, whichever is wrong vs. legacy.
   - **build** → Astro 7 Rust compiler errors are usually unclosed/mis-nested tags; image errors
     are usually a wrong `src/assets` path or case mismatch (`.JPG` vs `.jpg`).
   - **links** → broken internal href/src (use root-absolute paths), a route marked
     migrated/verified that isn't built / lacks a redirect, or a listed page linking to an
     unlisted one. Links to routes not migrated yet are only listed as pending, and image
     weight is only a warning: neither fails.
   - For any Astro error you don't immediately recognise, search its name or message in
     `mcp__astro-docs__search_astro_docs` (the Astro error reference is indexed) before
     changing code.
3. If the change touched specific pages and the dev server is running (`bunx astro dev status`),
   also run `bun run parity <route>` for them.
4. Report: pass/fail per step, what you fixed. Don't mark routes verified here; that's the
   parity reviewer's job, recorded with `bun run track … --review`.
