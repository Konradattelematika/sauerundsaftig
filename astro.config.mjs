// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadSiteDoc, pagePath } from './src/cms/store.mjs';

/**
 * Inhalte kommen aus dem CMS (docs/CMS-PLAN.md): SUS_CMS_FILE = veröffentlichter Stand bzw. Entwurf
 * (vom Server gesetzt), sonst der Seed in src/cms/seed. Der Server baut beim Veröffentlichen mit
 * SUS_OUT_DIR in ein neues Verzeichnis und schaltet danach um; SUS_ASTRO_CACHE_DIR hält den
 * Bild-Cache über Deploys hinweg (/data).
 */
const cms = loadSiteDoc();

/**
 * Sitemap nur für die Live-Site (Variante A im Wurzelpfad). Ausgeschlossen: alte Varianten,
 * interne Werkzeuge (Wähler, Module, Checkliste, Login, Admin, Dev), 404 sowie im CMS
 * deaktivierte oder auf noindex gesetzte Seiten.
 */
const SITEMAP_EXCLUDE = [
  /^\/(b|c|d|dev|module|checkliste|admin)(\/|$)/,
  /^\/(varianten|login|passwort|countdown)$/,
  /^\/404(\/|\.html)?$/,
];
const cmsExcluded = new Set(
  cms.pages.filter((p) => p.status !== 'published' || p.seo?.noindex).map((p) => pagePath(p)),
);

/** src/data/site.json → Einstellungen aus dem CMS (alle bisherigen Importe bleiben unverändert) */
function cmsSiteJson() {
  const VIRTUAL = '\0sus-cms-site-settings';
  return {
    name: 'sus-cms-site-json',
    enforce: /** @type {const} */ ('pre'),
    /** @param {string} source */
    resolveId(source) {
      return source.replace(/\\/g, '/').endsWith('data/site.json') ? VIRTUAL : null;
    },
    /** @param {string} id */
    load(id) {
      return id === VIRTUAL ? `export default ${JSON.stringify(cms.settings)};` : null;
    },
  };
}

export default defineConfig({
  site: cms.settings.siteUrl || 'https://sauerundsaftig.de',
  trailingSlash: 'never',
  outDir: process.env.SUS_OUT_DIR || './dist',
  cacheDir: process.env.SUS_ASTRO_CACHE_DIR || './node_modules/.astro',
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/+$/, '') || '/';
        return !SITEMAP_EXCLUDE.some((re) => re.test(path)) && !cmsExcluded.has(path);
      },
    }),
  ],
  vite: {
    plugins: [cmsSiteJson(), tailwindcss()],
  },
});
