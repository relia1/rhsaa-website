// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { legacyRedirects } from './src/config/redirects.mjs';
import { unlistedRoutes } from './src/config/unlisted.mjs';

const fontFiles = './node_modules/@fontsource-variable/playfair-display/files';
// Latin covers the legacy copy; latin-ext adds names with characters like ł, ő, ș.
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

// https://astro.build/config
export default defineConfig({
  // Canonical domain is www (owner decision 2026-10-21); the bare domain redirects on Amplify.
  site: 'https://www.rooseveltalumni.org',

  // `preserve` emits legacy's exact file layout (about/index.html, about/sota.html), so on
  // Amplify both /about/sota and /about/sota.html keep working with no redirects.
  build: { format: 'preserve' },
  trailingSlash: 'ignore',

  // Old *.html URLs and any renamed routes. Maintained by the migration workflow.
  redirects: legacyRedirects,

  // Self-hosted Playfair Display (owner decision 2026-10-12). Files come from the
  // @fontsource-variable package, so builds need no network; Astro copies them into
  // dist/ and generates a metric-matched fallback. Render with <Font cssVariable="--font-playfair" />.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Playfair Display',
      cssVariable: '--font-playfair',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          {
            src: [`${fontFiles}/playfair-display-latin-wght-normal.woff2`],
            weight: '400 900',
            style: 'normal',
            unicodeRange: [LATIN],
          },
          {
            src: [`${fontFiles}/playfair-display-latin-wght-italic.woff2`],
            weight: '400 900',
            style: 'italic',
            unicodeRange: [LATIN],
          },
          {
            src: [`${fontFiles}/playfair-display-latin-ext-wght-normal.woff2`],
            weight: '400 900',
            style: 'normal',
            unicodeRange: [LATIN_EXT],
          },
          {
            src: [`${fontFiles}/playfair-display-latin-ext-wght-italic.woff2`],
            weight: '400 900',
            style: 'italic',
            unicodeRange: [LATIN_EXT],
          },
        ],
      },
    },
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  // Unlisted pages stay published but are kept out of the sitemap (owner decision 2026-10-12).
  integrations: [
    sitemap({
      filter: (page) => {
        const p = new URL(page).pathname.replace(/\/$/, '') || '/';
        return !unlistedRoutes.includes(p);
      },
    }),
  ],
});
