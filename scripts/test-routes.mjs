#!/usr/bin/env node
/**
 * Route-Smoke-Test — prüft, dass kein interner Link 404/500 liefert
 * (Master-Prompt-Anforderung). Baut NICHT selbst: erwartet ein fertiges dist/
 * (Parameter --dist <dir>, Default "dist").
 *
 * Nur Bordmittel: node:http (lokaler Static-Server, bildet nginx-Verhalten aus
 * deploy/nginx.conf nach), node:fs, fetch (nativ ab Node 18+). Keine neuen Dependencies.
 *
 * Verhalten des lokalen Servers (nachgebildet aus deploy/nginx.conf):
 *   - $uri: existiert unter <dist>/<pfad> eine Datei → 200, diese Datei.
 *   - $uri/index.html: sonst existiert <dist>/<pfad>/index.html → 200, diese Datei.
 *   - sonst, wenn der Pfad mit /a/, /b/, /c/ oder /d/ beginnt: <prefix>404/index.html
 *     mit Status 404 (error_page 404 <prefix>404/index.html; im jeweiligen
 *     location-Block, try_files endet dort auf =404).
 *   - sonst (kein Varianten-Prefix): /404.html mit Status 404.
 *   - Fehlt auch DIESE Datei (die von error_page angesteuerte 404-Seite selbst),
 *     bleibt es bei nginx TROTZDEM bei Status 404 (nicht 500!): nginx' Default
 *     `recursive_error_pages off` verhindert, dass ein zweiter 404-Fehler beim
 *     Ausliefern der Fehlerseite selbst erneut error_page auslöst — genau das
 *     steht auch im Kommentar in deploy/nginx.conf ("liefert nginx dann ein
 *     schlichtes 404 statt eines 500"). Ein Routing-bedingtes 500 ist mit dieser
 *     Konfiguration praktisch ausgeschlossen; „echte" 500 in diesem Skript
 *     bedeuten daher einen Fetch-/Serverfehler unseres lokalen Nachbaus, nicht
 *     eine nginx-Fehlerkaskade.
 *   - WICHTIG deshalb: eine fehlende `<prefix>404/index.html` ist trotzdem ein
 *     echter Mangel (VARIANT-BRIEF verlangt eine eigene, gestaltete 404-Seite
 *     je Variante) — dafür gibt es unten einen eigenen, dateisystembasierten
 *     Check je Variante (unabhängig vom simulierten HTTP-Status).
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
// Statischer Server, bildet deploy/nginx.conf nach
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

const VARIANT_PREFIX_RE = /^\/(a|b|c|d)\//;
const KNOWN_VARIANTS = ['a', 'b', 'c', 'd'];

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

const GENERIC_404_BODY = '404 Not Found (nginx-Default — keine eigene 404-Datei gefunden)';

/**
 * Bildet `try_files $uri $uri/index.html =404;` + die error_page-404-Behandlung
 * aus deploy/nginx.conf nach (siehe Kommentar oben zu recursive_error_pages).
 * Liefert IMMER { status, filePath | body }, nie ein "echtes" 500 — 500 kommt in
 * diesem Skript ausschließlich aus Fetch-/Serverfehlern, nicht aus dieser Logik.
 */
function resolveNginx(pathname) {
  let safePath;
  try {
    safePath = path.posix.normalize(decodeURIComponent(pathname));
  } catch {
    // Kaputte Prozent-Kodierung: nginx würde die Anfrage ablehnen (400); wir
    // werten das konservativ als "nicht gefunden", damit der Server nicht abstürzt.
    return { status: 400, body: 'Bad Request (ungültige URI-Kodierung)' };
  }

  const asFile = fileIfExists(path.join(DIST_ROOT, safePath));
  if (asFile) return { status: 200, filePath: asFile };

  const asIndex = fileIfExists(path.join(DIST_ROOT, safePath, 'index.html'));
  if (asIndex) return { status: 200, filePath: asIndex };

  const prefixMatch = safePath.match(VARIANT_PREFIX_RE);
  if (prefixMatch) {
    const variant404 = fileIfExists(path.join(DIST_ROOT, prefixMatch[1], '404', 'index.html'));
    if (variant404) return { status: 404, filePath: variant404 };
    return { status: 404, body: GENERIC_404_BODY };
  }

  const root404 = fileIfExists(path.join(DIST_ROOT, '404.html'));
  if (root404) return { status: 404, filePath: root404 };
  return { status: 404, body: GENERIC_404_BODY };
}

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const result = resolveNginx(url.pathname);
    if (result.filePath) {
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
const HREF_RE = /(?<![\w-])href\s*=\s*["']([^"']+)["']/gi;
const SITE_ORIGIN = 'https://sauerundsaftig.jawollja.gmbh'; // astro.config.mjs `site`

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
  h = h.split('#')[0]; // Anker abschneiden
  if (h === '') return null;
  return h;
}

function extractLinks(html) {
  const out = [];
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html))) {
    const p = toInternalPath(m[1]);
    if (p) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ergebnis-Speicher
// ---------------------------------------------------------------------------
// path -> { status, sources: Set<string>, pflicht: boolean, kind: 'page'|'404check'|'404file' }
const results = new Map();

async function fetchRoute(baseUrl, routePath) {
  const res = await fetch(baseUrl + routePath);
  const contentType = res.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('text/html');
  const body = isHtml ? await res.text() : '';
  return { status: res.status, isHtml, body };
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
// Statische Pflichtliste (VARIANT-BRIEF-IA je Variante) + Content-Slugs
// ---------------------------------------------------------------------------
const PFLICHT_ROUTES = [
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

function detectVariants() {
  return KNOWN_VARIANTS.filter(
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
  const routes = ['/'];
  for (const v of variants) {
    routes.push(`/${v}`);
    for (const r of PFLICHT_ROUTES) routes.push(`/${v}${r}`);
    for (const slug of workshopSlugs) routes.push(`/${v}/workshops/${slug}`);
    for (const slug of journalSlugs) routes.push(`/${v}/journal/${slug}`);
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Crawl: BFS ab "/" + allen Pflichtrouten (damit auch Links, die nur von
// Pflichtseiten aus erreichbar sind, entdeckt werden — nicht nur von der
// Startseite aus).
// ---------------------------------------------------------------------------
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
      for (const link of extractLinks(fetched.body)) {
        recordResult(link, results.get(link)?.status ?? -1, { source: current });
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
    }
  }
}

/**
 * 404-Datei-Existenz je Variante: dateisystembasiert (nicht per HTTP-Statuscode) —
 * VARIANT-BRIEF verlangt eine eigene, gestaltete 404-Seite je Variante; nginx
 * liefert per Default-Fallback so oder so 404 (siehe Kommentar oben), daher ist
 * die reine Existenz der Datei der aussagekräftigere Check.
 */
function checkVariant404Files(variants) {
  for (const v of variants) {
    const routeLabel = `/${v}/404 (Datei-Existenz)`;
    const exists = fileIfExists(path.join(DIST_ROOT, v, '404', 'index.html')) !== null;
    recordResult(routeLabel, exists ? 200 : 404, { pflicht: true, kind: '404file' });
  }
  const rootExists = fileIfExists(path.join(DIST_ROOT, '404.html')) !== null;
  recordResult('/404.html (Datei-Existenz)', rootExists ? 200 : 404, { pflicht: true, kind: '404file' });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function statusLabel(entry) {
  if (entry.kind === '404file') return entry.status === 200 ? 'OK (vorhanden)' : 'FAIL (fehlt)';
  if (entry.status >= 200 && entry.status < 400) return `OK (${entry.status})`;
  return `FAIL (${entry.status || 'kein Fetch'})`;
}
function isFailing(entry) {
  if (entry.kind === '404file') return entry.status !== 200;
  return !(entry.status >= 200 && entry.status < 400);
}

function printReport(variants) {
  const rows = [...results.entries()].sort(([a], [b]) => a.localeCompare(b));

  console.log('\n=== Route-Smoke-Test — Sauer & Saftig ===');
  console.log(`dist: ${DIST_ROOT}`);
  console.log(`Gefundene Varianten in dist/: ${variants.length ? variants.join(', ') : '(keine)'}\n`);

  console.log('--- Routen-Tabelle ---');
  const colWidth = Math.min(60, Math.max(...rows.map(([r]) => r.length), 10));
  for (const [route, entry] of rows) {
    const tag = entry.kind === '404file' ? '[404-datei]' : entry.pflicht ? '[pflicht]' : '[crawl]';
    console.log(`${route.padEnd(colWidth)}  ${statusLabel(entry).padEnd(16)} ${tag}`);
  }

  const brokenCrawlLinks = [];
  for (const [route, entry] of rows) {
    if (entry.kind === '404file') continue;
    if (isFailing(entry) && entry.sources.size > 0) {
      for (const source of entry.sources) brokenCrawlLinks.push({ source, target: route, status: entry.status });
    }
  }
  console.log('\n--- Kaputte Links (Quelle → Ziel) ---');
  if (brokenCrawlLinks.length === 0) {
    console.log('(keine)');
  } else {
    for (const b of brokenCrawlLinks) {
      console.log(`${b.source} → ${b.target}  [${b.status || 'kein Fetch'}]`);
    }
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

  const failed404Files = rows.filter(([, e]) => e.kind === '404file' && isFailing(e));
  console.log('\n--- 404-Datei-Existenz je Variante (VARIANT-BRIEF verlangt eigene 404-Seite) ---');
  if (failed404Files.length === 0) {
    console.log('(alle vorhanden)');
  } else {
    for (const [route] of failed404Files) {
      console.log(`${route}  FEHLT`);
    }
  }

  const anyFailure = brokenCrawlLinks.length > 0 || failedPflicht.length > 0 || failed404Files.length > 0;

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
  const variants = detectVariants();
  const seedRoutes = buildPflichtRoutes(variants);
  await crawl(baseUrl, seedRoutes);
  checkVariant404Files(variants);
  const failed = printReport(variants);
  process.exitCode = failed ? 1 : 0;
} finally {
  server.close();
}
