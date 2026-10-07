#!/usr/bin/env node
/**
 * Route-Smoke-Test — prüft, dass kein interner Link 404/500 liefert
 * (Master-Prompt-Anforderung). Baut NICHT selbst: erwartet ein fertiges dist/
 * (Parameter --dist <dir>, Default "dist").
 *
 * Nur Bordmittel: node:http (lokaler Static-Server), node:fs, fetch (nativ ab Node 18+).
 * Keine neuen Dependencies.
 *
 * Struktur seit dem Live-Gang (docs/LIVE-PLAN.md §2.1):
 *   - Variante A „Krume" ist die Live-Site im WURZELPFAD (/karte, /besuch, …), ihre 404 liegt
 *     unter dist/404.html. Journal und Workshops gibt es in A nicht mehr.
 *   - Alte Varianten B/C/D liegen weiter unter /b, /c, /d (nur Vorschau-Host), je mit eigener
 *     404 unter <v>/404/index.html; der Variantenwähler unter /varianten.
 *
 * Verhalten des lokalen Servers (Dateiauflösung wie server/ bzw. LIVE-PLAN §2.2, Vorschau-Host
 * ohne Login):
 *   - /a und /a/* → 301 auf den Pfad ohne /a (alte Vorschau-Links).
 *   - Existiert <dist>/<pfad> als Datei → 200, diese Datei.
 *   - sonst <dist>/<pfad>/index.html → 200, diese Datei.
 *   - sonst, wenn der Pfad mit /b/, /c/ oder /d/ beginnt und es <v>/404/index.html gibt:
 *     diese Datei mit Status 404 (gestaltete 404 der alten Variante).
 *   - sonst /404.html (404 der Live-Site A) mit Status 404; fehlt sie, ein schlichtes 404.
 *   Ein 500 entsteht durch diese Logik nie — 500 hieße Fetch-/Serverfehler dieses Nachbaus.
 *
 * Zusätzlich (Live-Hygiene, nur Seiten der Live-Site, also nicht /b, /c, /d, /dev, /varianten):
 *   - kein leeres href="" und kein Link auf /a, /a/…, /journal…, /workshops…
 *   - /journal, /workshops und ihre Content-Slugs liefern im Wurzelpfad 404
 *   - dist/a existiert nicht mehr
 */

import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI-Argumente
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { dist: 'dist' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist' && argv[i + 1]) {
      args.dist = argv[i + 1];
      i++;
    }
  }
  return args;
}
const { dist: distArg } = parseArgs(process.argv.slice(2));
const DIST_ROOT = path.isAbsolute(distArg) ? distArg : path.resolve(ROOT, distArg);

if (!existsSync(DIST_ROOT) || !statSync(DIST_ROOT).isDirectory()) {
  console.error(`✗ dist-Verzeichnis nicht gefunden: ${DIST_ROOT}`);
  console.error('  Erst bauen (z. B. `pnpm exec astro build`), dann test:routes ausführen.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Statischer Server (Dateiauflösung wie LIVE-PLAN §2.2, ohne Login/Host-Routing)
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Alte Varianten mit eigenem Präfix (A liegt seit dem Live-Gang im Wurzelpfad) */
const LEGACY_VARIANTS = ['b', 'c', 'd'];
const LEGACY_PREFIX_RE = /^\/(b|c|d)\//;
/** Pfade, die NICHT zur Live-Site gehören (für die Live-Hygiene-Prüfung) */
const NON_LIVE_RE = /^\/(b|c|d|dev|varianten|module|checkliste)(\/|$)/;

/** Prüft, ob `candidate` unterhalb von DIST_ROOT liegt und eine reguläre Datei ist. */
function fileIfExists(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved !== DIST_ROOT && !resolved.startsWith(DIST_ROOT + path.sep)) return null; // kein Path-Traversal
  try {
    const st = statSync(resolved);
    if (st.isFile()) return resolved;
  } catch {
    /* not found */
  }
  return null;
}

const GENERIC_404_BODY = '404 Not Found (keine eigene 404-Datei gefunden)';

/**
 * Löst einen Pfad wie der Server auf. Liefert { status, filePath | body | location }.
 */
function resolveRoute(pathname) {
  let safePath;
  try {
    safePath = path.posix.normalize(decodeURIComponent(pathname));
  } catch {
    return { status: 400, body: 'Bad Request (ungültige URI-Kodierung)' };
  }

  // Alte Vorschau-Links /a/… → 301 auf den Pfad ohne /a
  if (safePath === '/a' || safePath.startsWith('/a/')) {
    return { status: 301, location: safePath.slice(2) || '/' };
  }

  const asFile = fileIfExists(path.join(DIST_ROOT, safePath));
  if (asFile) return { status: 200, filePath: asFile };

  const asIndex = fileIfExists(path.join(DIST_ROOT, safePath, 'index.html'));
  if (asIndex) return { status: 200, filePath: asIndex };

  const prefixMatch = safePath.match(LEGACY_PREFIX_RE);
  if (prefixMatch) {
    const variant404 = fileIfExists(path.join(DIST_ROOT, prefixMatch[1], '404', 'index.html'));
    if (variant404) return { status: 404, filePath: variant404 };
  }

  const root404 = fileIfExists(path.join(DIST_ROOT, '404.html'));
  if (root404) return { status: 404, filePath: root404 };
  return { status: 404, body: GENERIC_404_BODY };
}

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const result = resolveRoute(url.pathname);
    if (result.location) {
      res.writeHead(result.status, { Location: result.location + url.search });
      res.end();
    } else if (result.filePath) {
      res.writeHead(result.status, { 'Content-Type': mimeFor(result.filePath) });
      res.end(readFileSync(result.filePath));
    } else {
      res.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(result.body ?? '');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Link-Extraktion (Regex, kein HTML-Parser — reicht für statisches Astro-Markup)
// ---------------------------------------------------------------------------
// Negative Lookbehind verhindert Treffer auf `data-href=`, `x-href=` u. Ä.
const HREF_RE = /(?<![\w-])href\s*=\s*["']([^"']*)["']/gi;
const SITE_ORIGIN = 'https://sauerundsaftig.de'; // astro.config.mjs `site`

/**
 * Normalisiert einen href-Wert zu einem same-origin Pfad oder gibt null zurück
 * (externe URL, mailto:, tel:, reiner Anker, protokoll-relativ).
 */
function toInternalPath(href) {
  let h = href.trim();
  if (h.startsWith('#') || h === '') return null;
  if (h.startsWith('mailto:') || h.startsWith('tel:')) return null;
  if (h.startsWith('//')) return null; // protokoll-relativ = extern
  if (h.startsWith(SITE_ORIGIN)) {
    h = h.slice(SITE_ORIGIN.length) || '/';
  } else if (h.startsWith('http://') || h.startsWith('https://')) {
    return null; // externe Domain
  }
  if (!h.startsWith('/')) return null; // relative Pfade kommen im Markup nicht vor
  h = h.split('#')[0].split('?')[0]; // Anker/Query abschneiden
  if (h === '') return null;
  return h;
}

/** Liefert { links: string[], emptyHrefs: number } */
function extractLinks(html) {
  const links = [];
  let emptyHrefs = 0;
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html))) {
    if (m[1].trim() === '') emptyHrefs++;
    const p = toInternalPath(m[1]);
    if (p) links.push(p);
  }
  return { links, emptyHrefs };
}

// ---------------------------------------------------------------------------
// Ergebnis-Speicher
// ---------------------------------------------------------------------------
// path -> { status, sources: Set<string>, pflicht: boolean, kind: 'page'|'404file'|'expect404' }
const results = new Map();
/** Verstöße gegen die Live-Hygiene: { page, problem } */
const hygiene = [];

async function fetchRoute(baseUrl, routePath) {
  const res = await fetch(baseUrl + routePath); // folgt Redirects (z. B. /a/… → …)
  const contentType = res.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('text/html');
  const body = isHtml ? await res.text() : '';
  return { status: res.status, isHtml, body, redirected: res.redirected };
}

function recordResult(routePath, status, { source, pflicht = false, kind = 'page' } = {}) {
  let entry = results.get(routePath);
  if (!entry) {
    entry = { status, sources: new Set(), pflicht: false, kind };
    results.set(routePath, entry);
  }
  entry.status = status;
  if (source) entry.sources.add(source);
  if (pflicht) entry.pflicht = true;
  if (kind !== 'page') entry.kind = kind;
  return entry;
}

// ---------------------------------------------------------------------------
// Pflichtlisten
// ---------------------------------------------------------------------------
/** Live-Site (Variante A) im Wurzelpfad */
const LIVE_ROUTES = [
  '/',
  '/karte',
  '/karte/fruehstueck',
  '/karte/kuchen',
  '/karte/brot',
  '/karte/schnecken',
  '/karte/kaffee',
  '/sauerteig',
  '/ueber-uns',
  '/ueber-mich',
  '/vorbestellen',
  '/shop',
  '/gastgeber',
  '/besuch',
  '/faq',
  '/kontakt',
  '/jobs',
  '/impressum',
  '/datenschutz',
  '/varianten',
];

/** Alte Varianten B/C/D (VARIANT-BRIEF-IA, inkl. Workshops/Journal) */
const LEGACY_ROUTES = [
  '/karte',
  '/karte/fruehstueck',
  '/karte/kuchen',
  '/karte/brot',
  '/karte/schnecken',
  '/karte/kaffee',
  '/sauerteig',
  '/ueber-uns',
  '/workshops',
  '/vorbestellen',
  '/shop',
  '/gastgeber',
  '/journal',
  '/besuch',
  '/faq',
  '/kontakt',
  '/jobs',
  '/impressum',
  '/datenschutz',
];

function detectLegacyVariants() {
  return LEGACY_VARIANTS.filter(
    (v) => existsSync(path.join(DIST_ROOT, v)) && statSync(path.join(DIST_ROOT, v)).isDirectory(),
  );
}

function readSlugs(contentDir) {
  const dir = path.join(ROOT, 'src', 'content', contentDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx?$/, ''));
}

function buildPflichtRoutes(variants) {
  const workshopSlugs = readSlugs('workshops');
  const journalSlugs = readSlugs('journal');
  const routes = [...LIVE_ROUTES];
  for (const v of variants) {
    routes.push(`/${v}`);
    for (const r of LEGACY_ROUTES) routes.push(`/${v}${r}`);
    for (const slug of workshopSlugs) routes.push(`/${v}/workshops/${slug}`);
    for (const slug of journalSlugs) routes.push(`/${v}/journal/${slug}`);
  }
  return routes;
}

/** In der Live-Site entfernte Routen — müssen 404 liefern */
function buildRemovedRoutes() {
  return [
    '/journal',
    '/workshops',
    ...readSlugs('journal').map((s) => `/journal/${s}`),
    ...readSlugs('workshops').map((s) => `/workshops/${s}`),
  ];
}

// ---------------------------------------------------------------------------
// Crawl: BFS ab allen Pflichtrouten (damit auch Links, die nur von Pflichtseiten aus
// erreichbar sind, entdeckt werden — nicht nur von der Startseite aus).
// ---------------------------------------------------------------------------
const FORBIDDEN_LIVE_LINK_RE = /^\/(a|journal|workshops)(\/|$)/;

async function crawl(baseUrl, seedRoutes) {
  const visited = new Set();
  const queue = [...seedRoutes];
  const pflichtSet = new Set(seedRoutes);

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    let fetched;
    try {
      fetched = await fetchRoute(baseUrl, current);
    } catch (err) {
      recordResult(current, 0, { pflicht: pflichtSet.has(current) });
      results.get(current).note = `Fetch-Fehler: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    recordResult(current, fetched.status, { pflicht: pflichtSet.has(current) });

    if (fetched.isHtml) {
      const { links, emptyHrefs } = extractLinks(fetched.body);
      const isLivePage = !NON_LIVE_RE.test(current) && fetched.status === 200;
      if (isLivePage) {
        if (emptyHrefs > 0) hygiene.push({ page: current, problem: `${emptyHrefs}× href=""` });
        for (const link of new Set(links)) {
          if (FORBIDDEN_LIVE_LINK_RE.test(link)) hygiene.push({ page: current, problem: `Link auf ${link}` });
        }
      }
      for (const link of links) {
        recordResult(link, results.get(link)?.status ?? -1, { source: current });
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
    }
  }
}

/** Entfernte Live-Routen müssen 404 liefern (und dabei die 404 der Live-Site zeigen). */
async function checkRemovedRoutes(baseUrl) {
  for (const route of buildRemovedRoutes()) {
    const label = `${route} (muss 404 sein)`;
    try {
      const res = await fetch(baseUrl + route);
      recordResult(label, res.status === 404 ? 200 : res.status, { pflicht: true, kind: 'expect404' });
    } catch {
      recordResult(label, 0, { pflicht: true, kind: 'expect404' });
    }
  }
}

/**
 * 404-Dateien: Live-Site → dist/404.html; alte Varianten → <v>/404/index.html.
 * Außerdem darf es dist/a nicht mehr geben (A liegt im Wurzelpfad).
 */
function check404Files(variants) {
  const rootExists = fileIfExists(path.join(DIST_ROOT, '404.html')) !== null;
  recordResult('/404.html (Datei-Existenz, Live-Site)', rootExists ? 200 : 404, { pflicht: true, kind: '404file' });
  for (const v of variants) {
    const exists = fileIfExists(path.join(DIST_ROOT, v, '404', 'index.html')) !== null;
    recordResult(`/${v}/404 (Datei-Existenz)`, exists ? 200 : 404, { pflicht: true, kind: '404file' });
  }
  const aGone = !existsSync(path.join(DIST_ROOT, 'a'));
  recordResult('dist/a (darf nicht existieren)', aGone ? 200 : 404, { pflicht: true, kind: '404file' });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function statusLabel(entry) {
  if (entry.kind === '404file') return entry.status === 200 ? 'OK' : 'FAIL';
  if (entry.kind === 'expect404') return entry.status === 200 ? 'OK (404)' : `FAIL (${entry.status || 'kein Fetch'})`;
  if (entry.status >= 200 && entry.status < 400) return `OK (${entry.status})`;
  return `FAIL (${entry.status || 'kein Fetch'})`;
}
function isFailing(entry) {
  if (entry.kind === '404file' || entry.kind === 'expect404') return entry.status !== 200;
  return !(entry.status >= 200 && entry.status < 400);
}

function printReport(variants) {
  const rows = [...results.entries()].sort(([a], [b]) => a.localeCompare(b));

  console.log('\n=== Route-Smoke-Test — Sauer & Saftig ===');
  console.log(`dist: ${DIST_ROOT}`);
  console.log(`Live-Site: Variante A im Wurzelpfad · alte Varianten in dist/: ${variants.length ? variants.join(', ') : '(keine)'}\n`);

  console.log('--- Routen-Tabelle ---');
  const colWidth = Math.min(60, Math.max(...rows.map(([r]) => r.length), 10));
  for (const [route, entry] of rows) {
    const tag =
      entry.kind === '404file' ? '[datei]' : entry.kind === 'expect404' ? '[entfernt]' : entry.pflicht ? '[pflicht]' : '[crawl]';
    console.log(`${route.padEnd(colWidth)}  ${statusLabel(entry).padEnd(16)} ${tag}`);
  }

  const brokenCrawlLinks = [];
  for (const [route, entry] of rows) {
    if (entry.kind !== 'page') continue;
    if (isFailing(entry) && entry.sources.size > 0) {
      for (const source of entry.sources) brokenCrawlLinks.push({ source, target: route, status: entry.status });
    }
  }
  console.log('\n--- Kaputte Links (Quelle → Ziel) ---');
  if (brokenCrawlLinks.length === 0) {
    console.log('(keine)');
  } else {
    for (const b of brokenCrawlLinks) console.log(`${b.source} → ${b.target}  [${b.status || 'kein Fetch'}]`);
  }

  const failedPflicht = rows.filter(([, e]) => e.pflicht && e.kind === 'page' && isFailing(e));
  console.log('\n--- Fehlgeschlagene Pflichtrouten ---');
  if (failedPflicht.length === 0) {
    console.log('(keine)');
  } else {
    for (const [route, entry] of failedPflicht) {
      console.log(`${route}  [${entry.status || 'kein Fetch'}]${entry.note ? ' — ' + entry.note : ''}`);
    }
  }

  const failedStructure = rows.filter(([, e]) => (e.kind === '404file' || e.kind === 'expect404') && isFailing(e));
  console.log('\n--- Struktur (404-Dateien, entfernte Routen, kein dist/a) ---');
  if (failedStructure.length === 0) {
    console.log('(alles in Ordnung)');
  } else {
    for (const [route, entry] of failedStructure) console.log(`${route}  ${statusLabel(entry)}`);
  }

  console.log('\n--- Live-Hygiene (kein href="", keine Links auf /a, /journal, /workshops) ---');
  if (hygiene.length === 0) {
    console.log('(sauber)');
  } else {
    for (const h of hygiene) console.log(`${h.page}: ${h.problem}`);
  }

  const anyFailure =
    brokenCrawlLinks.length > 0 || failedPflicht.length > 0 || failedStructure.length > 0 || hygiene.length > 0;

  console.log(`\n=== Ergebnis: ${anyFailure ? 'FEHLGESCHLAGEN' : 'OK'} (${rows.length} Routen geprüft) ===\n`);
  return anyFailure;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const server = await startServer();
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const variants = detectLegacyVariants();
  const seedRoutes = buildPflichtRoutes(variants);
  await crawl(baseUrl, seedRoutes);
  await checkRemovedRoutes(baseUrl);
  check404Files(variants);
  const failed = printReport(variants);
  process.exitCode = failed ? 1 : 0;
} finally {
  server.close();
}
