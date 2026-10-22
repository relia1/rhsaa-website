// Pages that are published but deliberately unlisted (owner decision 2026-10-12):
// reachable by direct URL, but not linked from nav or listing pages, excluded from the
// sitemap, and rendered with <meta name="robots" content="noindex">.
// Paths have no trailing slash. Plain JS so astro.config.mjs can import it.

/** @type {string[]} */
export const unlistedRoutes = [
  '/studentrep',
  '/volunteer/athleticdata',
  '/volunteer/digitalhistory',
  '/volunteer/graphicdesigner',
  '/volunteer/picnicdayof',
  '/volunteer/scholarshipadmin',
  '/volunteer/socialmediaassistant',
  '/volunteer/studentrepmentor',
  '/volunteer/yearbookarchivist',
  // Legacy also hides this listing page on purpose ("not linked under our volunteer page").
  '/volunteer/restricted',
];

/** @param {string} pathname */
export const isUnlisted = (pathname) => unlistedRoutes.includes(pathname.replace(/\/$/, '') || '/');
