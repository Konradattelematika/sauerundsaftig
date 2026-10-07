// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/**
 * Sitemap nur für die Live-Site (Variante A im Wurzelpfad). Ausgeschlossen: alte Varianten,
 * interne Werkzeuge (Wähler, Module, Checkliste, Login, Dev) sowie noindex-Seiten (404, Rechtstexte).
 */
const SITEMAP_EXCLUDE = [
  /^\/(b|c|d|dev|module|checkliste)(\/|$)/,
  /^\/(varianten|login|passwort)$/,
  /^\/404(\/|\.html)?$/,
  /^\/(impressum|datenschutz)$/,
];

export default defineConfig({
  site: 'https://sauerundsaftig.de',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/+$/, '') || '/';
        return !SITEMAP_EXCLUDE.some((re) => re.test(path));
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
