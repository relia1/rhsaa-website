---
name: add-content
description: Add or update recurring RHSAA site content after launch — a grant award, scholarship recipient, Rose Festival princess, volunteer role, board/officer change, committee update, State of the Association year, event or board meeting date, link. Use when the user gives new content for the site.
argument-hint: <content type> [details or attached files]
---

# Add content: $ARGUMENTS

Recurring content lives in content collections (`src/content.config.ts`). Adding it should
never need new page code.

1. **Identify the collection** from the request (grants, scholarshipRecipients, princesses,
   volunteerRoles, board, committees, sotaReports, events, links). Read its schema and two
   existing entries to match style, ordering fields and image conventions.
2. **Collect what's missing.** Required schema fields the user didn't give (e.g. grant amount,
   fiscal year, class year, alt text for a photo) → ask in one message. Never invent facts.
3. **Images:** put new photos in the collection's `src/assets/<folder>/` using the existing
   naming pattern (e.g. grants `YYYYMMslug.jpg`, scholarships `YYYYFirstname.jpg`). Write factual
   alt text and confirm it with the user if it describes people.
4. **Write the entry**, keeping the user's wording verbatim for bios/descriptions (fix only
   obvious typos, and say which).
5. **Rollover cases:**
   - New SOTA year: the current report moves to its archive URL (`/about/sota<YEAR>`) and the
     new one takes `/about/sota`; add the archive link wherever legacy listed past reports.
   - Board changes: update the existing entry rather than adding a duplicate person.
   - Volunteer role filled: set `visibility` (don't delete) unless the user says remove it.
     Making a page unlisted or listed means editing both its `visibility` and
     `src/config/unlisted.mjs`, plus a line in `docs/DECISIONS.md`. Listed pages must not link
     to unlisted ones (`bun run links` checks this).
   - New events/board meeting dates: past dates move out of "upcoming" automatically only if the
     page sorts by date — check, otherwise remove them explicitly.
6. Run `bun run verify`; if the dev server is running, view the page and describe the result.
7. Summarise the change in two lines and offer to commit as `content(<collection>): <summary>`.
