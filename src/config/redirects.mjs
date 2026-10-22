// Redirects from legacy URLs to new routes.
// Keys are old paths, values are new paths. Add an entry whenever a migrated
// page's URL changes, and for every legacy `*.html` URL that may be bookmarked.
// Keep this file plain JS so astro.config.mjs can import it without a build step.

/** @type {Record<string, string>} */
export const legacyRedirects = {
  // '/about/sota.html': '/about/sota',
};
