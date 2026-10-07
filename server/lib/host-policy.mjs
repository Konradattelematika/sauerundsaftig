/**
 * Host-Routing nach docs/LIVE-PLAN.md §2.2 — reine Funktionen ohne I/O.
 *
 * route() entscheidet anhand von Host, Pfad und Uhrzeit, WAS mit einer Anfrage passiert
 * (Redirect, statische Datei, API, Login …). Ob eine Session vorliegt, prüft app.mjs anhand
 * von decision.authRequired.
 */

/** Auf dem Live-Host gesperrte Pfad-Präfixe (erstes Segment). */
export const LIVE_BLOCKED = new Set(['b', 'c', 'd', 'dev', 'varianten', 'module', 'checkliste']);
/** Varianten mit eigener 404-Seite (nur Vorschau-Host). */
export const VARIANT_404 = new Set(['b', 'c', 'd']);
/** Asset-Pfade: ohne Session erreichbar (Login-Seite braucht CSS/Logo). */
const ASSET_PREFIXES = ['/_astro/', '/brand/'];
const ASSET_FILES = new Set(['/favicon.ico', '/site.webmanifest']);

/** Host-Header → Hostname ohne Port, lowercase, ohne abschließenden Punkt. */
export function normalizeHost(hostHeader) {
  if (typeof hostHeader !== 'string') return '';
  let h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 0 ? h.slice(0, end + 1) : '';
  }
  const colon = h.indexOf(':');
  if (colon >= 0) h = h.slice(0, colon);
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

/** @returns {{ kind: 'live'|'www'|'tool'|'preview', prefix?: string }} */
export function classifyHost(host, config) {
  if (config.liveHosts.includes(host)) return { kind: 'live' };
  if (config.wwwHosts.includes(host)) return { kind: 'www' };
  const prefix = Object.hasOwn(config.toolHosts, host) ? config.toolHosts[host] : undefined;
  if (prefix) return { kind: 'tool', prefix };
  return { kind: 'preview' };
}

/** Ist die Go-Live-Schranke offen? */
export function isGoLive(config, now) {
  if (config.forcePrivate || !config.goLiveAt) return false;
  return now.getTime() >= config.goLiveAt.getTime();
}

/**
 * Roh-Pfad (wie im Request, prozentkodiert) → dekodierte Segmente.
 * Lehnt Traversal (`.`/`..`), kodierte Slashes/Backslashes und NUL-Bytes ab.
 * @returns {{ ok: true, segments: string[], path: string, needsCanonical: boolean } | { ok: false, status: number }}
 */
export function normalizePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) return { ok: false, status: 400 };
  const segments = [];
  for (const raw of rawPath.split('/')) {
    if (raw === '') continue;
    let seg;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return { ok: false, status: 400 };
    }
    if (seg === '' || seg === '.' || seg === '..' || /[/\\\0]/.test(seg)) return { ok: false, status: 400 };
    segments.push(seg);
  }
  const needsCanonical = rawPath.includes('//') || (rawPath.length > 1 && rawPath.endsWith('/'));
  return { ok: true, segments, path: '/' + segments.join('/'), needsCanonical };
}

/** Segmente → sicher kodierter Pfad (für Location-Header; nie protokoll-relativ). */
export function encodePath(segments) {
  return '/' + segments.map((s) => encodeURIComponent(s)).join('/');
}

export function isAssetPath(p) {
  return ASSET_FILES.has(p) || ASSET_PREFIXES.some((pre) => p.startsWith(pre));
}

/** Kandidaten für einen Seitenpfad: Datei, Ordner-index, .html. */
export function fileCandidates(p) {
  if (p === '/') return ['/index.html'];
  return [p, `${p}/index.html`, `${p}.html`];
}

export function robotsTxt(allow, host) {
  if (allow) return `User-agent: *\nAllow: /\n\nSitemap: https://${host}/sitemap-index.xml\n`;
  return 'User-agent: *\nDisallow: /\n';
}

/**
 * Zentrale Routing-Entscheidung.
 * @param {{ method: string, host: string, rawPath: string, search: string }} req  host bereits normalisiert
 * @param {object} config  aus loadConfig()
 * @param {Date} now
 */
export function route(req, config, now) {
  const { method, host, rawPath } = req;
  const search = req.search ?? '';
  const hostInfo = classifyHost(host, config);
  const norm = normalizePath(rawPath);

  if (hostInfo.kind === 'www') {
    const target = config.liveHosts[0] ?? 'sauerundsaftig.de';
    const p = norm.ok ? encodePath(norm.segments) : '/';
    return { type: 'redirect', status: 301, location: `https://${target}${p}${search}`, hostInfo, noindex: false };
  }
  if (!norm.ok) return { type: 'error', status: norm.status, hostInfo };

  const { segments } = norm;
  const p = norm.path;
  const publicLive = hostInfo.kind === 'live' && isGoLive(config, now);
  const base = {
    hostInfo,
    path: p,
    segments,
    noindex: !publicLive,
    privateCache: !publicLive,
    authRequired: false,
  };

  if (p === '/healthz') return { ...base, type: 'healthz' };
  if (p === '/api/golive') return { ...base, type: 'golive' };
  if (p === '/robots.txt') return { ...base, type: 'robots', body: robotsTxt(publicLive, host) };
  if (p === '/login') return { ...base, type: 'login', noindex: true, privateCache: true };
  if (p === '/logout') return { ...base, type: 'logout', noindex: true, privateCache: true };

  // Alte Vorschau-Links /a/… → ohne Präfix (Query bleibt erhalten)
  if (segments[0] === 'a') {
    return { ...base, type: 'redirect', status: 301, location: encodePath(segments.slice(1)) + search };
  }

  if (segments[0] === 'api') {
    // Live-Host: nur /api/golive (oben). Alles andere existiert dort nicht.
    if (hostInfo.kind === 'live') return { ...base, type: 'api-blocked' };
    return { ...base, type: 'api', apiSegments: segments.slice(1), privateCache: true };
  }

  if (norm.needsCanonical && (method === 'GET' || method === 'HEAD')) {
    return { ...base, type: 'redirect', status: 301, location: encodePath(segments) + search };
  }

  const asset = isAssetPath(p);
  const authRequired = !publicLive && !asset;
  let candidates;
  let notFound = ['/404.html'];

  if (hostInfo.kind === 'live') {
    candidates = LIVE_BLOCKED.has(segments[0]) ? [] : fileCandidates(p);
  } else if (hostInfo.kind === 'tool') {
    const pre = `/${hostInfo.prefix}`;
    if (asset) candidates = fileCandidates(p);
    else if (p === '/') candidates = [`${pre}/index.html`];
    else if (p === pre || p.startsWith(`${pre}/`)) candidates = fileCandidates(p);
    else candidates = [...fileCandidates(pre + p), ...fileCandidates(p)];
  } else {
    candidates = fileCandidates(p);
    if (VARIANT_404.has(segments[0])) {
      notFound = [`/${segments[0]}/404.html`, `/${segments[0]}/404/index.html`, '/404.html'];
    }
  }

  return { ...base, type: 'static', candidates, notFound, asset, authRequired };
}
