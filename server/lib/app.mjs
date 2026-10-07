/**
 * Request-Handler: verbindet Host-Policy, Login/Session, Static und API.
 * createApp() ist ohne Netzwerk testbar; startServer() startet einen echten HTTP-Server.
 */
import http from 'node:http';
import { handleApi } from './api.mjs';
import {
  RateLimiter,
  authenticate,
  clearSessionCookies,
  clientIp,
  createSessionToken,
  getSessionUser,
  safeNext,
  sessionCookie,
} from './auth.mjs';
import { encodePath, isGoLive, normalizeHost, route } from './host-policy.mjs';
import { HttpError, applyBaseHeaders, isSameOrigin, mediaType, readBody, redirect, sendJson, sendText } from './http.mjs';
import { StaticFiles } from './static.mjs';
import { Store } from './store.mjs';

const LOGIN_BODY_LIMIT = 8 * 1024;

/** Notfall-Login, falls dist/login/index.html fehlt (Build ohne Login-Seite). */
const FALLBACK_LOGIN = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Anmelden</title></head>
<body style="font-family:system-ui,sans-serif;max-width:22rem;margin:4rem auto;padding:0 1rem">
<h1>Anmelden</h1><form method="post" action="/login">
<p><label>Benutzername<br><input name="user" autocomplete="username" required></label></p>
<p><label>Passwort<br><input name="password" type="password" autocomplete="current-password" required></label></p>
<input type="hidden" name="next" id="next"><button>Anmelden</button></form>
<script>var n=new URLSearchParams(location.search).get('next');if(n)document.getElementById('next').value=n;</script>
</body></html>`;

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

/**
 * @param {{ config: object, store: Store, staticFiles: StaticFiles, now?: () => Date, log?: Console }} deps
 */
export function createApp({ config, store, staticFiles, now = () => new Date(), log = console }) {
  const nowMs = () => now().getTime();
  const loginLimiter = new RateLimiter(config.loginRateLimit, nowMs);
  const writeLimiter = new RateLimiter(config.writeRateLimit, nowMs);

  async function serveStaticOr404(req, res, decision, candidates) {
    const file = candidates.length ? await staticFiles.find(candidates) : null;
    if (file) {
      await staticFiles.serve(req, res, file, { cacheControl: cacheControlFor(file.rel, decision) });
      return;
    }
    const nf = await staticFiles.find(decision.notFound ?? ['/404.html']);
    if (nf) {
      await staticFiles.serve(req, res, nf, { status: 404, cacheControl: decision.privateCache ? 'private, no-store' : 'no-cache' });
      return;
    }
    sendText(res, 404, 'Nicht gefunden');
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
      case 'static':
        if (!isRead) {
          sendText(res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD' });
          return;
        }
        if (decision.authRequired && !user()) {
          redirect(res, 302, `/login?next=${encodeURIComponent(encodePath(decision.segments) + search)}`, {
            'Cache-Control': 'private, no-store',
          });
          return;
        }
        await serveStaticOr404(req, res, decision, decision.candidates);
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
export async function startServer(config, { now = () => new Date(), log = console, port = config.port, host = config.listenHost } = {}) {
  const store = await new Store({ dataDir: config.dataDir, seedFile: config.seedFile, now, log }).init();
  const staticFiles = await new StaticFiles(config.distDir, { log }).init();
  const handler = createApp({ config, store, staticFiles, now, log });
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
      await store.drain();
    })();
    return closing;
  };
  return { server, store, url, port: addr.port, close };
}
