/**
 * Integration: echter Server auf Ephemeral-Port, Temp-DATA_DIR, Fixture-dist (tests/server/fixtures/site).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AFTER_GO_LIVE,
  BEFORE_GO_LIVE,
  EXPORT_TOKEN,
  PASSWORDS,
  jsonHeaders,
  login,
  makeConfig,
  request,
  startTestServer,
} from './helpers.mjs';

const LIVE = 'sauerundsaftig.de';
const CHECK = 'checkliste.sauerundsaftig.de';
const MODULE = 'module.sauerundsaftig.de';
const PREVIEW = 'sauerundsaftig.jawollja.gmbh';

let srv;
let port;
let cookie; // Konrad (localhost-Login)

beforeAll(async () => {
  srv = await startTestServer();
  port = srv.port;
  ({ cookie } = await login(port, { ip: '10.0.0.99' }));
});
afterAll(async () => {
  await srv?.stop();
});

const get = (host, p, headers = {}) => request(port, { host, path: p, headers });
const authed = (host, p, headers = {}) => request(port, { host, path: p, headers: { Cookie: cookie, ...headers } });

describe('Grundfunktionen', () => {
  it('/healthz ohne Auth auf allen Hosts', async () => {
    for (const host of [LIVE, CHECK, PREVIEW, '127.0.0.1:3000']) {
      const res = await get(host, '/healthz');
      expect(res.status).toBe(200);
      expect(res.text).toBe('ok');
    }
  });
  it('Security-Header überall', async () => {
    const res = await get(LIVE, '/healthz');
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    });
  });
  it('/api/golive ohne Auth, auch auf dem Live-Host', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    const res = await get(LIVE, '/api/golive');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ goLiveAt: '2026-10-10T14:00:00.000Z', live: false, now: BEFORE_GO_LIVE.toISOString() });
    srv.clock.set(AFTER_GO_LIVE);
    expect((await get(CHECK, '/api/golive')).json.live).toBe(true);
    srv.clock.set(BEFORE_GO_LIVE);
  });
});

describe('Live-Host vor Go-Live', () => {
  it('ohne Session → 302 /login?next=…, noindex', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    const res = await get(LIVE, '/karte?x=1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?next=%2Fkarte%3Fx%3D1');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    // auch gesperrte/unbekannte Pfade verraten ohne Login nichts
    expect((await get(LIVE, '/b')).status).toBe(302);
    expect((await get(LIVE, '/gibtsnicht')).status).toBe(302);
  });
  it('Assets, Login-Seite und robots.txt ohne Session', async () => {
    const css = await get(LIVE, '/_astro/app.Ab12Cd.css');
    expect(css.status).toBe(200);
    expect(css.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(css.headers['content-type']).toBe('text/css; charset=utf-8');
    const logo = await get(LIVE, '/brand/logo.png');
    expect(logo.status).toBe(200);
    expect(logo.headers['cache-control']).toBe('public, max-age=604800');
    expect(logo.headers['content-type']).toBe('image/png');
    expect((await get(LIVE, '/favicon.ico')).headers['content-type']).toBe('image/x-icon');
    expect((await get(LIVE, '/site.webmanifest')).headers['content-type']).toBe('application/manifest+json; charset=utf-8');
    const page = await get(LIVE, '/login?next=/karte');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Login-Seite');
    expect(page.headers['cache-control']).toBe('private, no-store');
    const robots = await get(LIVE, '/robots.txt');
    expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
  });
  it('mit Session: Seite privat, gesperrte Präfixe 404, API gesperrt', async () => {
    const res = await authed(LIVE, '/karte');
    expect(res.status).toBe(200);
    expect(res.text).toContain('A Karte');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    const blocked = await authed(LIVE, '/b');
    expect(blocked.status).toBe(404);
    expect(blocked.text).toContain('A 404');
    expect((await authed(LIVE, '/module/farben')).status).toBe(404);
    const api = await authed(LIVE, '/api/checklist');
    expect(api.status).toBe(404);
    expect(api.json).toEqual({ error: 'Nicht gefunden' });
  });
});

describe('Live-Host ab Go-Live', () => {
  beforeAll(() => srv.clock.set(AFTER_GO_LIVE));
  afterAll(() => srv.clock.set(BEFORE_GO_LIVE));

  it('öffentlich, ohne X-Robots-Tag, HTML no-cache', async () => {
    const res = await get(LIVE, '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('A Start');
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-cache');
    expect((await get(LIVE, '/ueber-uns')).text).toContain('A Ueber uns'); // X.html
  });
  it('robots.txt erlaubt + Sitemap', async () => {
    expect((await get(LIVE, '/robots.txt')).text).toBe('User-agent: *\nAllow: /\n\nSitemap: https://sauerundsaftig.de/sitemap-index.xml\n');
  });
  it('404-Seite mit Status 404, gesperrte Präfixe weiterhin 404', async () => {
    const nf = await get(LIVE, '/gibtsnicht');
    expect(nf.status).toBe(404);
    expect(nf.text).toContain('A 404');
    for (const p of ['/b', '/c', '/d/x', '/dev', '/varianten', '/module', '/checkliste', '/api/me']) {
      expect((await get(LIVE, p)).status, p).toBe(404);
    }
  });
  it('/a-Redirect und Trailing-Slash', async () => {
    const a = await get(LIVE, '/a/karte?tag=1');
    expect(a.status).toBe(301);
    expect(a.headers.location).toBe('/karte?tag=1');
    expect((await get(LIVE, '/a')).headers.location).toBe('/');
    const slash = await get(LIVE, '/karte/');
    expect(slash.status).toBe(301);
    expect(slash.headers.location).toBe('/karte');
  });
  it('SUS_FORCE_PRIVATE hält die Seite zu', async () => {
    const priv = await startTestServer({ SUS_FORCE_PRIVATE: '1' }, { start: new Date('2027-01-01T00:00:00Z') });
    try {
      expect((await request(priv.port, { host: LIVE, path: '/' })).status).toBe(302);
      expect((await request(priv.port, { host: LIVE, path: '/api/golive' })).json.live).toBe(false);
      expect((await request(priv.port, { host: LIVE, path: '/robots.txt' })).text).toContain('Disallow: /');
    } finally {
      await priv.stop();
    }
  });
});

describe('www, Tool-Hosts, Vorschau', () => {
  it('www → 301 auf https://sauerundsaftig.de', async () => {
    const res = await get('www.sauerundsaftig.de', '/karte?x=1');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://sauerundsaftig.de/karte?x=1');
  });
  it('Tool-Host: immer Session, auch nach Go-Live', async () => {
    srv.clock.set(AFTER_GO_LIVE);
    try {
      const res = await get(CHECK, '/');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login?next=%2F');
      expect((await get(CHECK, '/robots.txt')).text).toBe('User-agent: *\nDisallow: /\n');
    } finally {
      srv.clock.set(BEFORE_GO_LIVE);
    }
  });
  it('Tool-Host checkliste: / → checkliste/index.html, Fallback auf dist/X', async () => {
    const root = await authed(CHECK, '/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('Checkliste App');
    expect(root.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect((await authed(CHECK, '/checkliste')).text).toContain('Checkliste App');
    expect((await authed(CHECK, '/karte')).text).toContain('A Karte');
    expect((await authed(CHECK, '/nix')).status).toBe(404);
  });
  it('Tool-Host module: /farben und /module/vorschau/…', async () => {
    expect((await authed(MODULE, '/')).text).toContain('Modul-Board');
    expect((await authed(MODULE, '/farben')).text).toContain('Modul Farben');
    expect((await authed(MODULE, '/module/vorschau/farben/alt-1')).text).toContain('Vorschau Farben Alt 1');
  });
  it('Vorschau-Host: alles mit Session, Varianten-404', async () => {
    expect((await get(PREVIEW, '/varianten')).status).toBe(302);
    expect((await authed(PREVIEW, '/varianten')).text).toContain('Varianten');
    const b404 = await authed(PREVIEW, '/b/gibtsnicht');
    expect(b404.status).toBe(404);
    expect(b404.text).toContain('B 404');
    const c404 = await authed(PREVIEW, '/c/gibtsnicht');
    expect(c404.status).toBe(404);
    expect(c404.text).toContain('A 404');
    expect((await authed(PREVIEW, '/a/karte')).headers.location).toBe('/karte');
  });
});

describe('Static: Sicherheit, Caching, Kompression', () => {
  it('Pfad-Traversal und Dotfiles', async () => {
    for (const p of ['/../outside.txt', '/%2e%2e/outside.txt', '/_astro/..%2f..%2foutside.txt', '/x%00y']) {
      const res = await authed('localhost', p);
      expect(res.status, p).toBe(400);
      expect(res.text).not.toContain('ausserhalb');
    }
    const env = await authed('localhost', '/.env');
    expect(env.status).toBe(404);
    expect(env.text).not.toContain('GEHEIM');
    expect((await authed('localhost', '/_astro/.env')).status).toBe(404);
  });
  it('HEAD liefert Header ohne Body', async () => {
    const res = await request(port, { method: 'HEAD', host: 'localhost', path: '/', headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
    expect(res.body.length).toBe(0);
  });
  it('ETag / If-None-Match → 304', async () => {
    const first = await get(LIVE, '/_astro/app.Ab12Cd.css');
    const etag = first.headers.etag;
    expect(etag).toMatch(/^"/);
    const second = await get(LIVE, '/_astro/app.Ab12Cd.css', { 'If-None-Match': etag });
    expect(second.status).toBe(304);
    expect(second.body.length).toBe(0);
    const logo = await get(LIVE, '/brand/logo.png');
    expect((await get(LIVE, '/brand/logo.png', { 'If-None-Match': logo.headers.etag })).status).toBe(304);
  });
  it('brotli/gzip nach Accept-Encoding, kleine Dateien unkomprimiert', async () => {
    const raw = await readFile(path.join(import.meta.dirname, 'fixtures/site/_astro/app.Ab12Cd.css'));
    const br = await get(LIVE, '/_astro/app.Ab12Cd.css', { 'Accept-Encoding': 'gzip, deflate, br' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toBe('Accept-Encoding');
    expect(zlib.brotliDecompressSync(br.body).equals(raw)).toBe(true);
    const gz = await get(LIVE, '/_astro/app.Ab12Cd.css', { 'Accept-Encoding': 'gzip, br;q=0' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(zlib.gunzipSync(gz.body).equals(raw)).toBe(true);
    expect(gz.headers.etag).not.toBe(br.headers.etag);
    const plain = await get(LIVE, '/_astro/app.Ab12Cd.css');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.equals(raw)).toBe(true);
    expect((await get(LIVE, '/_astro/tiny.Zz99.js', { 'Accept-Encoding': 'br' })).headers['content-encoding']).toBeUndefined();
    expect((await get(LIVE, '/brand/logo.png', { 'Accept-Encoding': 'br' })).headers['content-encoding']).toBeUndefined();
  });
  it('POST auf statische Seite → 405', async () => {
    const res = await request(port, { method: 'POST', host: 'localhost', path: '/karte', headers: { Cookie: cookie }, body: 'x' });
    expect(res.status).toBe(405);
  });
});

describe('Login-Flow', () => {
  it('Erfolg: 303 auf next, Cookie-Attribute je Host', async () => {
    const local = await login(port, { host: 'localhost', ip: '10.1.0.1', next: '/karte?x=1' });
    expect(local.res.status).toBe(303);
    expect(local.res.headers.location).toBe('/karte?x=1');
    expect(local.setCookie[0]).toMatch(/^sus_session=[\w-]+\.[\w-]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);

    const tool = await login(port, { host: CHECK, ip: '10.1.0.2', user: 'Josie', password: PASSWORDS.josie });
    expect(tool.res.headers.location).toBe('/');
    expect(tool.setCookie[0]).toContain('; Secure');
    expect(tool.setCookie[0]).not.toContain('Domain=');

    const prev = await login(port, { host: PREVIEW, ip: '10.1.0.3' });
    expect(prev.setCookie[0]).toContain('; Secure');
    expect(prev.setCookie[0]).not.toContain('Domain=');

  });
  it('Fehler: 303 /login?fehler=1&next=…', async () => {
    const res = await login(port, { ip: '10.2.0.1', password: 'falsch', next: '/karte' });
    expect(res.res.status).toBe(303);
    expect(res.res.headers.location).toBe('/login?fehler=1&next=%2Fkarte');
    expect(res.setCookie).toEqual([]);
    const unknown = await login(port, { ip: '10.2.0.1', user: 'niemand', password: 'x' });
    expect(unknown.res.headers.location).toBe('/login?fehler=1');
  });
  it('next wird validiert (kein Open-Redirect)', async () => {
    for (const next of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      const res = await login(port, { ip: '10.3.0.1', next });
      expect(res.res.headers.location, next).toBe('/');
    }
  });
  it('Rate-Limit: 10 Fehlversuche/10 min je IP, dann gesperrt (auch mit richtigem Passwort)', async () => {
    const ip = '10.4.0.1';
    for (let i = 1; i <= 9; i++) {
      expect((await login(port, { ip, password: 'falsch' })).res.headers.location).toBe('/login?fehler=1');
    }
    expect((await login(port, { ip, password: 'falsch' })).res.headers.location).toBe('/login?gesperrt=1');
    const blocked = await login(port, { ip, next: '/karte' });
    expect(blocked.res.headers.location).toBe('/login?gesperrt=1&next=%2Fkarte');
    expect(blocked.setCookie).toEqual([]);
    // Ein eingeschleuster linker Wert ändert nichts; der rechte, von Traefik angehängte Client zählt.
    expect((await login(port, { ip: '10.4.0.1, 10.4.0.2' })).res.headers.location).toBe('/');
    // nach 10 Minuten wieder frei
    srv.clock.advance(10 * 60 * 1000 + 1);
    try {
      expect((await login(port, { ip })).res.headers.location).toBe('/');
    } finally {
      srv.clock.set(BEFORE_GO_LIVE);
    }
  });
  it('Login-POST von fremder Herkunft → 403', async () => {
    const res = await request(port, {
      method: 'POST',
      path: '/login',
      host: 'localhost',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
      body: 'user=konrad&password=x',
    });
    expect(res.status).toBe(403);
  });
  it('GET /login mit Session → weiter zu next', async () => {
    const res = await request(port, { host: 'localhost', path: '/login?next=/karte', headers: { Cookie: cookie } });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/karte');
  });
  it('Logout (GET und POST) löscht Cookie', async () => {
    for (const method of ['GET', 'POST']) {
      const res = await request(port, { method, host: CHECK, path: '/logout', headers: { Cookie: cookie } });
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe('/login');
      const sc = [res.headers['set-cookie']].flat();
      expect(sc).toHaveLength(1);
      expect(sc.every((c) => c.startsWith('sus_session=;') && c.includes('Max-Age=0'))).toBe(true);
    }
  });
  it('manipulierter Cookie → wie nicht angemeldet', async () => {
    const forged = cookie.replace(/\.[\w-]+$/, '.AAAA');
    expect((await request(port, { host: 'localhost', path: '/', headers: { Cookie: forged } })).status).toBe(302);
    expect((await request(port, { host: 'localhost', path: '/api/me', headers: { Cookie: forged } })).status).toBe(401);
  });
});

describe('API', () => {
  const api = (method, p, body, headers = {}) =>
    request(port, { method, host: CHECK, path: p, body, headers: { ...jsonHeaders(cookie), ...headers } });

  it('ohne Session → 401 JSON', async () => {
    const res = await request(port, { host: CHECK, path: '/api/checklist' });
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ error: 'Nicht angemeldet' });
    const post = await request(port, { method: 'POST', host: CHECK, path: '/api/checklist/items', headers: jsonHeaders(), body: {} });
    expect(post.status).toBe(401);
  });
  it('GET /api/me', async () => {
    expect((await api('GET', '/api/me')).json).toEqual({ user: { id: 'konrad', name: 'Konrad', role: 'team' } });
  });
  it('GET /api/checklist enthält Seed-Items', async () => {
    const res = await api('GET', '/api/checklist');
    expect(res.status).toBe(200);
    expect(res.json.items.map((i) => i.id)).toEqual(['dns-www', 'fotos-josie']);
    expect(res.json.items[0]).toMatchObject({ updatedBy: 'seed', status: 'offen', priority: 'blocker', category: 'technik' });
    expect(res.json.comments).toEqual([]);
  });

  let itemId;
  let commentId;
  it('POST /api/checklist/items (Happy Path)', async () => {
    const res = await api('POST', '/api/checklist/items', {
      title: '  Speisekarte prüfen ',
      description: 'Preise abgleichen',
      phase: 'vor',
      owner: 'beide',
      unbekannt: 'wird ignoriert',
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      title: 'Speisekarte prüfen',
      description: 'Preise abgleichen',
      phase: 'vor',
      owner: 'beide',
      status: 'offen',
      priority: 'normal',
      category: 'allgemein',
      updatedBy: 'konrad',
      createdAt: BEFORE_GO_LIVE.toISOString(),
    });
    expect(res.json.unbekannt).toBeUndefined();
    expect(res.json.id).toMatch(/^p-[\w-]{8}$/);
    itemId = res.json.id;
  });
  it('POST /api/checklist/items Validierung', async () => {
    const cases = [
      [{ phase: 'vor', owner: 'team' }, /title/],
      [{ title: '', phase: 'vor', owner: 'team' }, /title/],
      [{ title: 'x'.repeat(201), phase: 'vor', owner: 'team' }, /title.*200/],
      [{ title: 'x', description: 'y'.repeat(4001), phase: 'vor', owner: 'team' }, /description/],
      [{ title: 'x', phase: 'während', owner: 'team' }, /phase/],
      [{ title: 'x', phase: 'vor', owner: 'chef' }, /owner/],
      [{ title: 'x', phase: 'vor', owner: 'team', priority: 'egal' }, /priority/],
      [{ title: 'x', phase: 'vor', owner: 'team', link: 'javascript:alert(1)' }, /link/],
    ];
    for (const [body, msg] of cases) {
      const res = await api('POST', '/api/checklist/items', body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(res.json.error).toMatch(msg);
    }
    expect((await api('POST', '/api/checklist/items', '{kaputt')).status).toBe(400);
    expect((await api('POST', '/api/checklist/items', '[1,2]')).status).toBe(400);
  });
  it('CSRF: Content-Type und Herkunft', async () => {
    const body = { title: 'x', phase: 'vor', owner: 'team' };
    const form = await api('POST', '/api/checklist/items', 'title=x', { 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(form.status).toBe(415);
    const foreign = await api('POST', '/api/checklist/items', body, { Origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    const foreignRef = await api('POST', '/api/checklist/items', body, { Referer: 'https://evil.example/x' });
    expect(foreignRef.status).toBe(403);
    const same = await api('POST', '/api/checklist/items', body, { Origin: `https://${CHECK}` });
    expect(same.status).toBe(201);
  });
  it('Body-Limit 64 KB → 413', async () => {
    const res = await api('POST', '/api/checklist/items', { title: 'x', description: 'y'.repeat(70 * 1024), phase: 'vor', owner: 'team' });
    expect(res.status).toBe(413);
    expect(res.json).toEqual({ error: 'Anfrage zu groß' });
  });
  it('PATCH /api/checklist/items/:id', async () => {
    const res = await api('PATCH', `/api/checklist/items/${itemId}`, { status: 'in_arbeit', assignee: 'Lukas' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: itemId, status: 'in_arbeit', assignee: 'Lukas', updatedBy: 'konrad' });
    const cleared = await api('PATCH', `/api/checklist/items/${itemId}`, { assignee: null });
    expect(cleared.json.assignee).toBeUndefined();
    expect((await api('PATCH', `/api/checklist/items/${itemId}`, { status: 'fertig' })).status).toBe(400);
    expect((await api('PATCH', `/api/checklist/items/${itemId}`, {})).status).toBe(400);
    expect((await api('PATCH', '/api/checklist/items/gibtsnicht', { status: 'offen' })).status).toBe(404);
    // Seed-Item wird durch Menschen „übernommen"
    const seed = await api('PATCH', '/api/checklist/items/dns-www', { status: 'erledigt' });
    expect(seed.json).toMatchObject({ status: 'erledigt', updatedBy: 'konrad' });
  });
  it('Methoden-Check', async () => {
    const res = await api('DELETE', `/api/checklist/items/${itemId}`);
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('PATCH');
    expect((await api('GET', '/api/gibtsnicht')).status).toBe(404);
  });
  it('POST /api/checklist/items/:id/comments', async () => {
    const res = await api('POST', `/api/checklist/items/${itemId}/comments`, { text: 'Bitte auch Allergene!' });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      itemId,
      userId: 'konrad',
      userName: 'Konrad',
      role: 'team',
      text: 'Bitte auch Allergene!',
      kind: 'feedback',
      resolved: false,
    });
    commentId = res.json.id;
    expect((await api('POST', `/api/checklist/items/${itemId}/comments`, { text: 'Wann?', kind: 'frage' })).json.kind).toBe('frage');
    expect((await api('POST', `/api/checklist/items/${itemId}/comments`, { text: 'x', kind: 'lob' })).status).toBe(400);
    expect((await api('POST', `/api/checklist/items/${itemId}/comments`, { text: 'x'.repeat(4001) })).status).toBe(400);
    expect((await api('POST', `/api/checklist/items/${itemId}/comments`, { text: '   ' })).status).toBe(400);
    expect((await api('POST', '/api/checklist/items/gibtsnicht/comments', { text: 'x' })).status).toBe(404);
  });
  it('PATCH /api/checklist/comments/:id', async () => {
    const res = await api('PATCH', `/api/checklist/comments/${commentId}`, { resolved: true });
    expect(res.json).toMatchObject({ id: commentId, resolved: true });
    expect((await api('PATCH', `/api/checklist/comments/${commentId}`, { resolved: 'ja' })).status).toBe(400);
    expect((await api('PATCH', '/api/checklist/comments/gibtsnicht', { resolved: true })).status).toBe(404);
  });
  it('PUT /api/module/votes (Upsert je Benutzer+Element+Option)', async () => {
    const v1 = await api('PUT', '/api/module/votes', { itemId: 'farben', optionId: 'alt-1', rating: 'gut', comment: 'warm' });
    expect(v1.status).toBe(200);
    expect(v1.json).toMatchObject({ itemId: 'farben', optionId: 'alt-1', userId: 'konrad', userName: 'Konrad', rating: 'gut', comment: 'warm' });
    const v2 = await api('PUT', '/api/module/votes', { itemId: 'farben', optionId: 'alt-1', rating: 'super', comment: '' });
    expect(v2.json.rating).toBe('super');
    await api('PUT', '/api/module/votes', { itemId: 'farben', optionId: 'live', rating: null, comment: 'bleibt' });
    const state = await api('GET', '/api/module/state');
    expect(state.json.votes).toHaveLength(2);
    expect(state.json.votes.find((v) => v.optionId === 'alt-1').rating).toBe('super');
    for (const body of [
      { itemId: 'Farben!', optionId: 'alt-1', rating: 'gut' },
      { itemId: 'farben', optionId: '', rating: 'gut' },
      { itemId: 'farben', optionId: 'alt-1', rating: 'mega' },
      { itemId: 'farben', optionId: 'alt-1', rating: 'gut', comment: 'x'.repeat(4001) },
      { itemId: 'x'.repeat(65), optionId: 'alt-1', rating: 'gut' },
    ]) {
      expect((await api('PUT', '/api/module/votes', body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
  });
  it('PUT /api/module/choices (eine Entscheidung je Benutzer und Element)', async () => {
    const { cookie: josie } = await login(port, { host: CHECK, user: 'josie', ip: '10.0.0.98' });
    const asJosie = (method, p, body) => request(port, { method, host: MODULE, path: p, body, headers: jsonHeaders(josie) });
    const c1 = await api('PUT', '/api/module/choices', { itemId: 'farben', optionId: 'alt-2' });
    expect(c1.json).toMatchObject({ itemId: 'farben', optionId: 'alt-2', userId: 'konrad', userName: 'Konrad' });
    await api('PUT', '/api/module/choices', { itemId: 'farben', optionId: 'alt-1' }); // Upsert: ersetzt alt-2
    await api('PUT', '/api/module/choices', { itemId: 'hero', optionId: 'live' });
    const j = await asJosie('PUT', '/api/module/choices', { itemId: 'farben', optionId: 'alt-3' });
    expect(j.json).toMatchObject({ itemId: 'farben', optionId: 'alt-3', userId: 'josie', userName: 'Josie' });
    await asJosie('PUT', '/api/module/choices', { itemId: 'hero', optionId: 'alt-1' });

    const key = (c) => `${c.userId}:${c.itemId}:${c.optionId}`;
    let state = await api('GET', '/api/module/state');
    expect(state.json.choices.map(key).sort()).toEqual(['josie:farben:alt-3', 'josie:hero:alt-1', 'konrad:farben:alt-1', 'konrad:hero:live']);
    // Josie sieht dieselben Entscheidungen aller Benutzer
    expect((await asJosie('GET', '/api/module/state')).json.choices.map(key).sort()).toEqual(state.json.choices.map(key).sort());

    // null entfernt nur die eigene Entscheidung
    expect((await api('PUT', '/api/module/choices', { itemId: 'hero', optionId: null })).json).toEqual({ removed: true });
    state = await api('GET', '/api/module/state');
    expect(state.json.choices.map(key).sort()).toEqual(['josie:farben:alt-3', 'josie:hero:alt-1', 'konrad:farben:alt-1']);
    expect((await api('PUT', '/api/module/choices', { itemId: 'hero', optionId: null })).json).toEqual({ removed: true });
    expect((await api('PUT', '/api/module/choices', { itemId: 'hero' })).status).toBe(400);
    expect((await api('PUT', '/api/module/choices', { itemId: 'hero', optionId: 'Alt 1' })).status).toBe(400);
  });
  it('API auch auf dem Vorschau-Host', async () => {
    const res = await request(port, { host: PREVIEW, path: '/api/module/state', headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });
  it('/api/export: Session oder Bearer-Token', async () => {
    const anon = await request(port, { host: CHECK, path: '/api/export' });
    expect(anon.status).toBe(401);
    const wrong = await request(port, { host: CHECK, path: '/api/export', headers: { Authorization: 'Bearer falsch' } });
    expect(wrong.status).toBe(401);
    const bearer = await request(port, { host: CHECK, path: '/api/export', headers: { Authorization: `Bearer ${EXPORT_TOKEN}` } });
    expect(bearer.status).toBe(200);
    expect(bearer.json).toMatchObject({ goLiveAt: '2026-10-10T14:00:00.000Z', live: false });
    expect(bearer.json.checklist.items.length).toBeGreaterThanOrEqual(3);
    expect(bearer.json.module.votes).toHaveLength(2);
    expect((await api('GET', '/api/export')).status).toBe(200);
    // Live-Host: auch mit Token gesperrt
    expect((await request(port, { host: LIVE, path: '/api/export', headers: { Authorization: `Bearer ${EXPORT_TOKEN}` } })).status).toBe(404);
  });
  it('/api/export.md: Markdown mit offenem Feedback zuerst', async () => {
    await api('POST', `/api/checklist/items/${itemId}/comments`, { text: 'Noch offen: Fotos fehlen' });
    const res = await request(port, { host: CHECK, path: '/api/export.md', headers: { Authorization: `Bearer ${EXPORT_TOKEN}` } });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    const md = res.text;
    expect(md).toContain('## Checkliste');
    expect(md).toContain('## Module');
    expect(md.indexOf('### Offenes Feedback')).toBeLessThan(md.indexOf('### Alle Punkte'));
    expect(md).toContain('Konrad · 08.10.2026, 12:00: Noch offen: Fotos fehlen'); // 10:00 UTC = 12:00 Berlin
    expect(md).toContain('[erledigt] Feedback · Konrad · 08.10.2026, 12:00: Bitte auch Allergene!');
    expect(md).toContain(
      '### farben\n\n- Entscheidungen:\n  - Josie: **alt-3** (08.10.2026, 12:00)\n  - Konrad: **alt-1** (08.10.2026, 12:00)\n',
    );
    expect(md).toContain('### hero\n\n- Entscheidungen:\n  - Josie: **alt-1** (08.10.2026, 12:00)\n');
    expect(md).toContain('alt-1: Konrad: Super gut');
    expect(md).toContain('live · Konrad · 08.10.2026, 12:00: bleibt');
  });
  it('Persistenz: Dateien + Audit-Log, Neustart behält Daten', async () => {
    const dir = srv.config.dataDir;
    const checklist = JSON.parse(await readFile(path.join(dir, 'checklist.json'), 'utf8'));
    expect(checklist.items.some((i) => i.id === itemId)).toBe(true);
    const events = (await readFile(path.join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(events.some((e) => e.action === 'checklist.item.create' && e.user === 'konrad')).toBe(true);
    expect(events.every((e) => typeof e.at === 'string')).toBe(true);

    const again = await startTestServer({}, { config: srv.config });
    try {
      const res = await request(again.port, { host: CHECK, path: '/api/checklist', headers: { Cookie: cookie } });
      expect(res.json.items.find((i) => i.id === 'dns-www')).toMatchObject({ status: 'erledigt', updatedBy: 'konrad' });
      expect(res.json.items.some((i) => i.id === itemId)).toBe(true);
    } finally {
      await again.close();
    }
  });
  it('Schreib-Rate-Limit → 429', async () => {
    const cfg = { ...(await makeConfig()), writeRateLimit: { max: 3, windowMs: 60_000 } };
    const s = await startTestServer({}, { config: cfg });
    try {
      const { cookie: c } = await login(s.port, { ip: '10.9.9.9' });
      const put = () =>
        request(s.port, { method: 'PUT', host: CHECK, path: '/api/module/votes', headers: jsonHeaders(c), body: { itemId: 'a', optionId: 'b', rating: 'gut' } });
      expect((await put()).status).toBe(200);
      expect((await put()).status).toBe(200);
      expect((await put()).status).toBe(200);
      const res = await put();
      expect(res.status).toBe(429);
      expect(res.json.error).toMatch(/Zu viele/);
    } finally {
      await s.stop();
    }
  });
});
