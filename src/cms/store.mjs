/**
 * CMS-Inhalt laden — reines Node-JS, genutzt vom Astro-Build (src/cms/index.ts, astro.config.mjs)
 * und vom Server (server/lib/cms/**). Typen: src/cms/types.ts.
 *
 * Quelle:
 *  - SUS_CMS_FILE gesetzt → genau diese JSON-Datei (Server-Builds: veröffentlichter Stand bzw. Entwurf)
 *  - sonst → Seed aus src/cms/seed/** (Grundbestand im Repo = bisherige Inhalte der Website)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CMS_SCHEMA_VERSION = 1;
/**
 * Seed-Verzeichnis: SUS_CMS_SEED_DIR, sonst neben dieser Datei (Server, astro.config) bzw. — wenn
 * Vite die Datei in dist/chunks gebündelt hat — relativ zum Projektverzeichnis (Build läuft dort).
 */
export const SEED_DIR = [
  process.env.SUS_CMS_SEED_DIR,
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed'),
  path.join(process.cwd(), 'src/cms/seed'),
].find((d) => d && existsSync(path.join(d, 'settings.json')));

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function readDirJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(path.join(dir, f)));
}

/**
 * Setzt den Seed zu einem SiteDoc zusammen.
 * Seiten: seed/pages/*.json (je Datei eine PageDoc; Reihenfolge über `order`, dann Dateiname).
 * Sammlungen: seed/collections/<name>.json.
 * @param {string} [seedDir]
 * @returns {import('./types').SiteDoc}
 */
export function assembleSeed(seedDir = SEED_DIR) {
  if (!seedDir) throw new Error('CMS: Seed-Verzeichnis nicht gefunden (SUS_CMS_SEED_DIR setzen)');
  const pages = readDirJson(path.join(seedDir, 'pages'))
    .map((p, i) => ({ order: i, ...p }))
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...p }) => p);
  const collections = {};
  const colDir = path.join(seedDir, 'collections');
  if (existsSync(colDir)) {
    for (const f of readdirSync(colDir).filter((x) => x.endsWith('.json')).sort()) {
      collections[f.replace(/\.json$/, '')] = readJson(path.join(colDir, f));
    }
  }
  const opt = (name, fallback) => (existsSync(path.join(seedDir, name)) ? readJson(path.join(seedDir, name)) : fallback);
  return {
    schemaVersion: CMS_SCHEMA_VERSION,
    settings: readJson(path.join(seedDir, 'settings.json')),
    navigation: opt('navigation.json', { main: [], cta: { label: '', href: '' }, footer: [], legal: [], social: [] }),
    layout: opt('layout.json', null),
    pages,
    collections,
    media: opt('media.json', []),
    redirects: opt('redirects.json', []),
  };
}

let cached = null;
let cachedKey = null;

/**
 * Der für diesen Build gültige SiteDoc (einmal pro Prozess geladen).
 * @returns {import('./types').SiteDoc}
 */
export function loadSiteDoc() {
  const file = process.env.SUS_CMS_FILE?.trim() || '';
  if (cached && cachedKey === file) return cached;
  cached = file ? readJson(path.resolve(file)) : assembleSeed();
  cachedKey = file;
  return cached;
}

/** true im Vorschau-/Editor-Build: Sektionen und Felder tragen data-cms-*-Marker, Editor-Brücke aktiv */
export function isEditBuild() {
  return process.env.SUS_CMS_EDIT === '1';
}

/* ------------------------------------------------------------------ Seiten & Links --------- */

/** Pfad einer Seite: '' → '/', 'karte' → '/karte' */
export function pagePath(page) {
  return page.slug ? `/${page.slug}` : '/';
}

/**
 * Linkziel → URL. Unbekannte page:-Ziele ergeben '#' (der Validator meldet sie vorher).
 * @param {string} href
 * @param {import('./types').SiteDoc} doc
 */
export function resolveHref(href, doc) {
  if (typeof href !== 'string' || !href) return '#';
  if (href === '{{tel}}') return `tel:${doc.settings.phone.replace(/[^\d+]/g, '')}`;
  if (href === '{{route}}') {
    const a = doc.settings.address;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${a.street}, ${a.zip} ${a.city}`)}`;
  }
  if (href.startsWith('page:')) {
    const [id, anchor] = href.slice(5).split('#');
    const page = doc.pages.find((p) => p.id === id);
    if (!page) return '#';
    return pagePath(page) + (anchor ? `#${anchor}` : '');
  }
  return href;
}

/** Ist ein Linkziel extern (neuer Tab sinnvoll, rel=noopener)? */
export function isExternalHref(href) {
  return /^https?:\/\//i.test(href || '') || href === '{{route}}';
}
