/**
 * Request-Handler: verbindet Host-Policy, Login/Session, Static und API.
 * createApp() ist ohne Netzwerk testbar; startServer() startet einen echten HTTP-Server.
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { handleApi } from './api.mjs';
import {
  RateLimiter,
  authenticate,
  clearSessionCookies,
  clientIp,
  createSessionToken,
  getSessionUser,
  hashPassword,
  safeNext,
  sessionCookie,
  verifyPassword,
} from './auth.mjs';
import { encodePath, fileCandidates, isGoLive, normalizeHost, route } from './host-policy.mjs';
import { HttpError, applyBaseHeaders, isSameOrigin, mediaType, readBody, redirect, sendJson, sendText } from './http.mjs';
import { PasswordOverrides } from './passwords.mjs';
import { Store } from './store.mjs';
import { createCms } from './cms/index.mjs';
import { bannerHtml, injectBanner, previewCookie, previewRequested } from './cms/preview.mjs';
import { can } from './cms/users.mjs';

const LOGIN_BODY_LIMIT = 8 * 1024;
const PASSWORD_MIN_LENGTH = 10;

/** Notfall-Login, falls dist/login/index.html fehlt (Build ohne Login-Seite). */
const FALLBACK_LOGIN = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Anmelden</title></head>
<body style="font-family:system-ui,sans-serif;max-width:22rem;margin:4rem auto;padding:0 1rem">
<h1>Anmelden</h1><form method="post" action="/login">
<p><label>Benutzername<br><input name="user" autocomplete="username" required></label></p>
<p><label>Passwort<br><input name="password" type="password" autocomplete="current-password" required></label></p>
<input type="hidden" name="next" id="next"><button>Anmelden</button></form>
<script>var n=new URLSearchParams(location.search).get('next');if(n)document.getElementById('next').value=n;</script>
</body></html>`;

/** Kleine HTML-Seite für 403 im Dashboard-Bereich */
const FORBIDDEN_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Kein Zugriff</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>Kein Zugriff</h1><p>Dein Benutzerkonto hat keine Berechtigung für das Dashboard. Bitte wende dich an eine Person mit Admin-Rechten.</p>
<p><a href="/">Zur Website</a> · <a href="/logout">Abmelden</a></p></body></html>`;

function cacheControlFor(rel, decision) {
  if (rel.startsWith('/_astro/')) return 'public, max-age=31536000, immutable';
  if (rel.startsWith('/brand/')) return 'public, max-age=604800';
  if (decision.privateCache) return rel.endsWith('.html') ? 'private, no-store' : 'private, no-cache';
  return 'no-cache';
}

function splitUrl(url) {
  const raw = typeof url === 'string' ? url : '/';
  const q = raw.indexOf('?');
  return q >= 0 ? { rawPath: raw.slice(0, q), search: raw.slice(q) } : { rawPath: raw, search: '' };
}

async function readLoginForm(req) {
  const buf = await readBody(req, LOGIN_BODY_LIMIT);
  const type = mediaType(req);
  if (type === 'application/json') {
    try {
      const o = JSON.parse(buf.toString('utf8'));
      return { user: o?.user, password: o?.password, next: o?.next };
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(buf.toString('utf8'));
  return { user: params.get('user'), password: params.get('password'), next: params.get('next') };
}

async function readPasswordForm(req) {
  const buf = await readBody(req, LOGIN_BODY_LIMIT);
  const params = new URLSearchParams(buf.toString('utf8'));
  return { current: params.get('current'), password: params.get('password'), password2: params.get('password2') };
}

/**
 * @param {{ config: object, store: Store, staticFiles: { find: Function, serve: Function }, passwords?: { set(id: string, hash: string): Promise<void> },
 *           cms?: object, now?: () => Date, log?: Console }} deps
 *   staticFiles: StaticFiles bzw. StaticSwitch (das CMS schaltet nach jedem Build um) · cms: aus createCms()
 */
export function createApp({ config, store, staticFiles, passwords, cms = null, now = () => new Date(), log = console }) {
  const nowMs = () => now().getTime();
  const loginLimiter = new RateLimiter(config.loginRateLimit, nowMs);
  const writeLimiter = new RateLimiter(config.writeRateLimit, nowMs);

  /** CMS-Weiterleitung für Pfade ohne Datei (aus dem aktuellen Live-Build) → true, wenn umgeleitet */
  function tryRedirect(req, res, decision, search) {
    const r = (req.method === 'GET' || req.method === 'HEAD') && cms ? cms.redirectFor(decision.path) : null;
    if (!r) return false;
    // Query der Anfrage mitnehmen (vor einem #anker), außer das Ziel hat eine eigene oder ist extern
    const hashAt = r.to.indexOf('#');
    let target = r.to;
    if (search && !r.to.includes('?') && !/^https?:/i.test(r.to)) {
      target = hashAt >= 0 ? r.to.slice(0, hashAt) + search + r.to.slice(hashAt) : r.to + search;
    }
    const cache = r.status === 301 && !decision.privateCache ? 'public, max-age=3600' : 'private, no-store';
    redirect(res, r.status, target, { 'Cache-Control': cache });
    return true;
  }

  async function serveStaticOr404(req, res, decision, candidates, search = '') {
    const file = candidates.length ? await staticFiles.find(candidates) : null;
    if (file) {
      await staticFiles.serve(req, res, file, { cacheControl: cacheControlFor(file.rel, decision) });
      return;
    }
    if (tryRedirect(req, res, decision, search)) return;
    const nf = await staticFiles.find(decision.notFound ?? ['/404.html']);
    if (nf) {
      await staticFiles.serve(req, res, nf, { status: 404, cacheControl: decision.privateCache ? 'private, no-store' : 'no-cache' });
      return;
    }
    sendText(res, 404, 'Nicht gefunden');
  }

  /**
   * Vorschau-Modus: HTML/Assets aus dem Vorschau-Build (Fallback: Live-Build), HTML mit Vorschau-Leiste
   * (außer ?__cms=editor). Antworten sind privat und werden nicht zwischengespeichert (Assets: Hash im Namen).
   */
  async function servePreview(req, res, decision, search) {
    const sources = cms.previewFiles.inner ? [cms.previewFiles, staticFiles] : [staticFiles];
    const findIn = async (candidates) => {
      for (const src of sources) {
        const f = candidates.length ? await src.find(candidates) : null;
        if (f) return { file: f, files: src };
      }
      return null;
    };
    let hit = await findIn(decision.candidates);
    let status = 200;
    if (!hit) {
      if (tryRedirect(req, res, decision, search)) return;
      hit = await findIn(decision.notFound ?? ['/404.html']);
      if (!hit) {
        sendText(res, 404, 'Nicht gefunden');
        return;
      }
      status = 404;
    }
    const { file, files } = hit;
    if (!file.rel.endsWith('.html') || new URLSearchParams(search).get('__cms') === 'editor') {
      const cacheControl = file.rel.startsWith('/_astro/') ? 'private, max-age=31536000, immutable' : 'private, no-store';
      await files.serve(req, res, file, { status, cacheControl });
      return;
    }
    const html = await readFile(file.abs, 'utf8');
    const previewState = cms.builds.status().preview?.state;
    const banner = bannerHtml({
      path: decision.path,
      search,
      previewBuild: cms.builds.previewOnline(),
      draftRevision: cms.store.draftMeta().revision,
      building: previewState === 'queued' || previewState === 'running',
    });
    const body = Buffer.from(injectBanner(html, banner), 'utf8');
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function sendForbiddenPage(req, res) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
    res.end(req.method === 'HEAD' ? undefined : FORBIDDEN_HTML);
  }

  /** /admin[/…] → dist/admin/index.html (Session + cms.view) */
  async function handleAdmin(req, res, decision, search, user) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD' });
      return;
    }
    if (!user) {
      redirect(res, 302, `/login?next=${encodeURIComponent(encodePath(decision.segments) + search)}`, { 'Cache-Control': 'private, no-store' });
      return;
    }
    if (!can(user, 'cms.view')) {
      sendForbiddenPage(req, res);
      return;
    }
    const candidates = decision.path === '/admin' ? ['/admin/index.html'] : [...fileCandidates(decision.path), '/admin/index.html'];
    const file = await staticFiles.find(candidates);
    if (!file) {
      sendText(res, 503, 'Die Admin-Oberfläche ist in diesem Build nicht enthalten.');
      return;
    }
    await staticFiles.serve(req, res, file, { cacheControl: file.rel.endsWith('.html') ? 'private, no-store' : 'private, no-cache' });
  }

  /** /admin/vorschau?an=1 bzw. ?aus=1, &next=/pfad → Vorschau-Cookie setzen/löschen und weiter */
  function handlePreviewToggle(req, res, host, search, user) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD' });
      return;
    }
    if (!user) {
      redirect(res, 302, `/login?next=${encodeURIComponent(`/admin/vorschau${search}`)}`, { 'Cache-Control': 'private, no-store' });
      return;
    }
    if (!can(user, 'cms.view')) {
      sendForbiddenPage(req, res);
      return;
    }
    const params = new URLSearchParams(search);
    const on = !params.has('aus');
    const next = safeNext(params.get('next') ?? (on ? '/' : '/admin'));
    redirect(res, 302, next, { 'Set-Cookie': previewCookie(host, on), 'Cache-Control': 'private, no-store' });
  }

  async function handleLogin(req, res, decision, host, search, user) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const next = new URLSearchParams(search).get('next');
      if (user) {
        redirect(res, 302, safeNext(next ?? '/'));
        return;
      }
      const page = await staticFiles.find(['/login/index.html', '/login.html']);
      if (page) {
        await staticFiles.serve(req, res, page, { cacheControl: 'private, no-store' });
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
        res.end(req.method === 'HEAD' ? undefined : FALLBACK_LOGIN);
      }
      return;
    }
    if (req.method !== 'POST') {
      sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD, POST' });
      return;
    }
    if (!isSameOrigin(req)) {
      sendText(res, 403, 'Anfrage von fremder Herkunft abgelehnt');
      return;
    }
    const form = await readLoginForm(req);
    const next = safeNext(typeof form.next === 'string' ? form.next : '/');
    const back = (flag) => `/login?${flag}=1${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`;
    const ip = clientIp(req);
    if (loginLimiter.isBlocked(ip)) {
      log.warn(`[login] gesperrt ip=${ip}`);
      redirect(res, 303, back('gesperrt'));
      return;
    }
    const found = await authenticate(config.users, form.user, form.password);
    if (!found) {
      const blocked = loginLimiter.hit(ip);
      log.warn(`[login] fehlgeschlagen ip=${ip}${blocked ? ' (jetzt gesperrt)' : ''}`);
      redirect(res, 303, back(blocked ? 'gesperrt' : 'fehler'));
      return;
    }
    loginLimiter.reset(ip);
    const token = createSessionToken(found, config, nowMs());
    log.info?.(`[login] ok user=${found.id} host=${host}`);
    redirect(res, 303, next, { 'Set-Cookie': sessionCookie(token, host, config) });
  }

  /** /passwort: eigenes Passwort ändern (GET = Seite, POST = Änderung). Nur angemeldet. */
  async function handlePassword(req, res, host, user) {
    const toLogin = '/login?next=%2Fpasswort';
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!user) {
        redirect(res, 302, toLogin, { 'Cache-Control': 'private, no-store' });
        return;
      }
      const page = await staticFiles.find(['/passwort/index.html', '/passwort.html']);
      if (!page) {
        sendText(res, 404, 'Nicht gefunden');
        return;
      }
      await staticFiles.serve(req, res, page, { cacheControl: 'private, no-store' });
      return;
    }
    if (req.method !== 'POST') {
      sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD, POST' });
      return;
    }
    if (!isSameOrigin(req)) {
      sendText(res, 403, 'Anfrage von fremder Herkunft abgelehnt');
      return;
    }
    if (!user) {
      redirect(res, 303, toLogin);
      return;
    }
    const account = config.users.find((u) => u.id === user.id);
    if (!passwords || !account) {
      sendText(res, 503, 'Passwortänderung ist gerade nicht möglich');
      return;
    }
    const back = (code) => redirect(res, 303, `/passwort?fehler=${code}`, { 'Cache-Control': 'private, no-store' });
    const ip = clientIp(req);
    if (loginLimiter.isBlocked(ip)) {
      back('gesperrt');
      return;
    }
    const form = await readPasswordForm(req);
    const current = typeof form.current === 'string' ? form.current : '';
    if (current.length === 0 || current.length > 1024 || !(await verifyPassword(current, account.hash))) {
      const blocked = loginLimiter.hit(ip);
      log.warn(`[passwort] aktuelles Passwort falsch user=${account.id} ip=${ip}${blocked ? ' (jetzt gesperrt)' : ''}`);
      back(blocked ? 'gesperrt' : 'aktuell');
      return;
    }
    const pw = typeof form.password === 'string' ? form.password : '';
    if ([...pw.normalize('NFC')].length < PASSWORD_MIN_LENGTH) return back('kurz');
    if (pw.length > 1024) return back('lang');
    if (pw !== form.password2) return back('ungleich');
    if (pw === current) return back('gleich');
    await passwords.set(account.id, await hashPassword(pw));
    log.info?.(`[passwort] geändert user=${account.id} host=${host}`);
    // Alte Sessions sind jetzt ungültig (Fingerabdruck) — die aktuelle bekommt ein neues Cookie
    const token = createSessionToken(account, config, nowMs());
    redirect(res, 303, '/passwort?ok=1', { 'Set-Cookie': sessionCookie(token, host, config), 'Cache-Control': 'private, no-store' });
  }

  async function handle(req, res) {
    const host = normalizeHost(req.headers.host);
    const { rawPath, search } = splitUrl(req.url);
    const nowDate = now();
    const decision = route({ method: req.method, host, rawPath, search }, config, nowDate);
    applyBaseHeaders(res, { noindex: decision.noindex ?? true });

    let userCache;
    const user = () => (userCache === undefined ? (userCache = getSessionUser(req.headers.cookie, config, nowDate.getTime())) : userCache);
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    switch (decision.type) {
      case 'redirect':
        redirect(res, decision.status, decision.location, decision.status === 301 ? { 'Cache-Control': 'public, max-age=3600' } : {});
        return;
      case 'error':
        sendText(res, decision.status, 'Ungültige Anfrage');
        return;
      case 'healthz':
        sendText(res, 200, 'ok');
        return;
      case 'golive':
        if (!isRead) {
          sendJson(res, 405, { error: 'Methode nicht erlaubt' }, { Allow: 'GET, HEAD' });
          return;
        }
        sendJson(res, 200, {
          goLiveAt: config.goLiveAt ? config.goLiveAt.toISOString() : null,
          live: isGoLive(config, nowDate),
          now: nowDate.toISOString(),
        });
        return;
      case 'robots':
        sendText(res, 200, decision.body, { 'Cache-Control': 'no-cache' });
        return;
      case 'login':
        await handleLogin(req, res, decision, host, search, user());
        return;
      case 'password':
        await handlePassword(req, res, host, user());
        return;
      case 'logout':
        if (!isRead && req.method !== 'POST') {
          sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD, POST' });
          return;
        }
        redirect(res, 303, '/login', { 'Set-Cookie': clearSessionCookies(host, config) });
        return;
      case 'api-blocked':
        sendJson(res, 404, { error: 'Nicht gefunden' });
        return;
      case 'api':
        await handleApi({ req, res, apiSegments: decision.apiSegments, user: user(), store, config, now, writeLimiter });
        return;
      case 'cms-api':
        if (!cms) {
          sendJson(res, 503, { error: 'CMS nicht verfügbar' });
          return;
        }
        await cms.handleApi({ req, res, segments: decision.apiSegments, user: user(), host, search, writeLimiter });
        return;
      case 'admin':
        await handleAdmin(req, res, decision, search, user());
        return;
      case 'cms-preview-toggle':
        handlePreviewToggle(req, res, host, search, user());
        return;
      case 'static':
        if (!isRead) {
          sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD' });
          return;
        }
        if (decision.authRequired && !user()) {
          if (decision.anonCandidates) {
            await serveStaticOr404(req, res, decision, decision.anonCandidates, search);
            return;
          }
          redirect(res, 302, `/login?next=${encodeURIComponent(encodePath(decision.segments) + search)}`, {
            'Cache-Control': 'private, no-store',
          });
          return;
        }
        if (cms && previewRequested(req.headers.cookie) && can(user(), 'cms.view')) {
          await servePreview(req, res, decision, search);
          return;
        }
        await serveStaticOr404(req, res, decision, decision.candidates, search);
        return;
      default:
        sendText(res, 500, 'Interner Fehler');
    }
  }

  return async function handler(req, res) {
    const t0 = process.hrtime.bigint();
    if (config.accessLog) {
      res.on('finish', () => {
        if (req.url === '/healthz') return;
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        log.info?.(`${req.method} ${normalizeHost(req.headers.host)}${splitUrl(req.url).rawPath} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
    }
    try {
      await handle(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) sendText(res, err.status, err.message, err.headers);
        return;
      }
      log.error(`[server] Fehler bei ${req.method} ${req.url}: ${err?.stack ?? err}`);
      if (!res.headersSent) sendText(res, 500, 'Interner Fehler');
      else res.destroy();
    }
  };
}

/**
 * Store + Static initialisieren und HTTP-Server starten.
 * @returns {Promise<{ server: http.Server, store: Store, url: string, close: () => Promise<void> }>}
 */
export async function startServer(config, { now = () => new Date(), log = console, port = config.port, host = config.listenHost, builder, cmsOptions = {} } = {}) {
  const store = await new Store({ dataDir: config.dataDir, seedFile: config.seedFile, now, log }).init();
  // Env-Benutzer (Bootstrap): PasswordOverrides setzt deren wirksamen Hash; das CMS spiegelt danach
  // Env- und Dashboard-Benutzer in config.users (Login und Session-Prüfung arbeiten darauf).
  const envUsers = [...config.users];
  const passwords = await new PasswordOverrides({ dataDir: config.dataDir, users: envUsers, now, log }).init();
  const cms = await createCms({ config, envUsers, passwords, now, log, builder, ...cmsOptions });
  const handler = createApp({ config, store, staticFiles: cms.liveFiles, passwords: cms.users, cms, now, log });
  const server = http.createServer(handler);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address();
  const url = `http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}`;

  let closing = null;
  const close = () => {
    closing ??= (async () => {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
      });
      await cms.close();
      await store.drain();
    })();
    return closing;
  };
  return { server, store, cms, url, port: addr.port, close };
}
