import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/lib/config.mjs';
import { classifyHost, isGoLive, normalizeHost, normalizePath, robotsTxt, route } from '../../server/lib/host-policy.mjs';

const config = loadConfig({ SUS_SESSION_SECRET: 'x'.repeat(40), SUS_USERS: '[]' });
const before = new Date('2026-10-19T13:59:59Z');
const after = new Date('2026-10-19T14:00:00Z');
const r = (host, rawPath, now = before, extra = {}) => route({ method: 'GET', host, rawPath, search: '', ...extra }, config, now);

describe('normalizeHost', () => {
  it('schneidet Port ab, lowercase, abschließender Punkt', () => {
    expect(normalizeHost('SauerUndSaftig.DE:443')).toBe('sauerundsaftig.de');
    expect(normalizeHost('sauerundsaftig.de.')).toBe('sauerundsaftig.de');
    expect(normalizeHost('[::1]:4412')).toBe('[::1]');
    expect(normalizeHost(undefined)).toBe('');
  });
});

describe('classifyHost', () => {
  it('ordnet die Hosts nach Plan §2.2 zu (Defaults)', () => {
    expect(classifyHost('sauerundsaftig.de', config)).toEqual({ kind: 'live' });
    expect(classifyHost('www.sauerundsaftig.de', config)).toEqual({ kind: 'www' });
    expect(classifyHost('checkliste.sauerundsaftig.de', config)).toEqual({ kind: 'tool', prefix: 'checkliste' });
    expect(classifyHost('module.sauerundsaftig.de', config)).toEqual({ kind: 'tool', prefix: 'module' });
    expect(classifyHost('sauerundsaftig.jawollja.gmbh', config)).toEqual({ kind: 'preview' });
    expect(classifyHost('localhost', config)).toEqual({ kind: 'preview' });
    expect(classifyHost('irgendwas.example', config)).toEqual({ kind: 'preview' });
    expect(classifyHost('toString', config)).toEqual({ kind: 'preview' });
  });
  it('liest Hosts aus der Umgebung', () => {
    const c = loadConfig({
      SUS_LIVE_HOSTS: 'live.test, LIVE2.test',
      SUS_WWW_HOSTS: 'www.live.test',
      SUS_TOOL_HOSTS: 'todo.live.test=checkliste,board.live.test=module,kaputt',
      SUS_SESSION_SECRET: 'x'.repeat(40),
    });
    expect(c.liveHosts).toEqual(['live.test', 'live2.test']);
    expect(classifyHost('todo.live.test', c)).toEqual({ kind: 'tool', prefix: 'checkliste' });
    expect(classifyHost('board.live.test', c)).toEqual({ kind: 'tool', prefix: 'module' });
    expect(classifyHost('sauerundsaftig.de', c)).toEqual({ kind: 'preview' });
    expect(c.warnings.some((w) => w.includes('kaputt'))).toBe(true);
  });
});

describe('Go-Live', () => {
  it('Default 19.10.2026 16:00 Berlin = 14:00 UTC', () => {
    expect(config.goLiveAt.toISOString()).toBe('2026-10-19T14:00:00.000Z');
    expect(isGoLive(config, before)).toBe(false);
    expect(isGoLive(config, after)).toBe(true);
  });
  it('SUS_FORCE_PRIVATE hält die Schranke zu', () => {
    const c = loadConfig({ SUS_FORCE_PRIVATE: '1', SUS_SESSION_SECRET: 'x'.repeat(40) });
    expect(isGoLive(c, new Date('2030-01-01T00:00:00Z'))).toBe(false);
    expect(route({ method: 'GET', host: 'sauerundsaftig.de', rawPath: '/' }, c, after).authRequired).toBe(true);
  });
  it('ungültiges SUS_GO_LIVE_AT → privat (fail closed) + Warnung', () => {
    const c = loadConfig({ SUS_GO_LIVE_AT: 'morgen', SUS_SESSION_SECRET: 'x'.repeat(40) });
    expect(c.goLiveAt).toBeNull();
    expect(isGoLive(c, new Date('2030-01-01T00:00:00Z'))).toBe(false);
    expect(c.warnings.join(' ')).toMatch(/SUS_GO_LIVE_AT/);
  });
});

describe('route — Live-Host', () => {
  it('vor Go-Live: Seiten brauchen Session, noindex, privater Cache', () => {
    const d = r('sauerundsaftig.de', '/karte');
    expect(d).toMatchObject({ type: 'static', authRequired: true, noindex: true, privateCache: true });
    expect(d.candidates).toEqual(['/karte', '/karte/index.html', '/karte.html']);
    expect(d.notFound).toEqual(['/404.html']);
  });
  it('vor Go-Live: Ausnahmen ohne Session', () => {
    for (const p of ['/_astro/x.css', '/brand/logo.png', '/favicon.ico', '/site.webmanifest']) {
      expect(r('sauerundsaftig.de', p).authRequired, p).toBe(false);
    }
    expect(r('sauerundsaftig.de', '/login').type).toBe('login');
    expect(r('sauerundsaftig.de', '/logout').type).toBe('logout');
    expect(r('sauerundsaftig.de', '/healthz').type).toBe('healthz');
    expect(r('sauerundsaftig.de', '/api/golive').type).toBe('golive');
    expect(r('sauerundsaftig.de', '/robots.txt')).toMatchObject({ type: 'robots', body: 'User-agent: *\nDisallow: /\n' });
  });
  it('ab Go-Live: öffentlich, indexierbar, robots mit Sitemap', () => {
    const d = r('sauerundsaftig.de', '/karte', after);
    expect(d).toMatchObject({ type: 'static', authRequired: false, noindex: false, privateCache: false });
    expect(r('sauerundsaftig.de', '/robots.txt', after).body).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://sauerundsaftig.de/sitemap-index.xml\n',
    );
  });
  it('gesperrte Präfixe → keine Kandidaten (404), auch nach Go-Live', () => {
    for (const p of ['/b', '/b/karte', '/c', '/d/x', '/dev', '/varianten', '/module', '/module/vorschau/farben/alt-1', '/checkliste']) {
      for (const now of [before, after]) {
        const d = r('sauerundsaftig.de', p, now);
        expect(d.type, p).toBe('static');
        expect(d.candidates, p).toEqual([]);
      }
    }
    // Ähnliche, aber erlaubte Pfade
    expect(r('sauerundsaftig.de', '/besuch', after).candidates.length).toBeGreaterThan(0);
    expect(r('sauerundsaftig.de', '/modulex', after).candidates.length).toBeGreaterThan(0);
  });
  it('API außer /api/golive ist gesperrt', () => {
    expect(r('sauerundsaftig.de', '/api/checklist', after).type).toBe('api-blocked');
    expect(r('sauerundsaftig.de', '/api/me').type).toBe('api-blocked');
    expect(r('sauerundsaftig.de', '/api').type).toBe('api-blocked');
  });
  it('/a und /a/* → 301 ohne Präfix, Query bleibt', () => {
    expect(r('sauerundsaftig.de', '/a')).toMatchObject({ type: 'redirect', status: 301, location: '/' });
    expect(r('sauerundsaftig.de', '/a/karte/schnecken', before, { search: '?x=1&y=2' })).toMatchObject({
      type: 'redirect',
      status: 301,
      location: '/karte/schnecken?x=1&y=2',
    });
    expect(r('sauerundsaftig.de', '/a//evil.com').location).toBe('/evil.com');
    expect(r('sauerundsaftig.de', '/about').type).toBe('static');
  });
  it('Trailing Slash und doppelte Slashes → 301 auf kanonischen Pfad', () => {
    expect(r('sauerundsaftig.de', '/karte/', after)).toMatchObject({ type: 'redirect', location: '/karte' });
    expect(r('sauerundsaftig.de', '//evil.com/', after)).toMatchObject({ type: 'redirect', location: '/evil.com' });
    expect(r('sauerundsaftig.de', '/', after).type).toBe('static');
  });
});

describe('route — www, Tool-Hosts, Vorschau', () => {
  it('www → 301 auf Live-Host (Pfad + Query erhalten)', () => {
    expect(r('www.sauerundsaftig.de', '/karte', before, { search: '?q=1' })).toMatchObject({
      type: 'redirect',
      status: 301,
      location: 'https://sauerundsaftig.de/karte?q=1',
    });
    expect(r('www.sauerundsaftig.de', '/%zz').location).toBe('https://sauerundsaftig.de/');
  });
  it('Tool-Host checkliste: Präfix-Mapping, immer Session, noindex', () => {
    const host = 'checkliste.sauerundsaftig.de';
    expect(r(host, '/', after)).toMatchObject({ candidates: ['/checkliste/index.html'], authRequired: true, noindex: true });
    expect(r(host, '/checkliste', after).candidates).toEqual(['/checkliste', '/checkliste/index.html', '/checkliste.html']);
    expect(r(host, '/karte', after).candidates).toEqual([
      '/checkliste/karte',
      '/checkliste/karte/index.html',
      '/checkliste/karte.html',
      '/karte',
      '/karte/index.html',
      '/karte.html',
    ]);
    expect(r(host, '/_astro/x.css', after)).toMatchObject({ candidates: ['/_astro/x.css', '/_astro/x.css/index.html', '/_astro/x.css.html'], authRequired: false });
    expect(r(host, '/robots.txt', after).body).toBe('User-agent: *\nDisallow: /\n');
    expect(r(host, '/api/checklist', after).type).toBe('api');
  });
  it('Tool-Host module: /farben → dist/module/farben, /module/vorschau/… direkt', () => {
    const host = 'module.sauerundsaftig.de';
    expect(r(host, '/farben').candidates[1]).toBe('/module/farben/index.html');
    expect(r(host, '/module/vorschau/farben/alt-1').candidates[1]).toBe('/module/vorschau/farben/alt-1/index.html');
  });
  it('Vorschau-Host: alles, immer Session, Varianten-404', () => {
    const host = 'sauerundsaftig.jawollja.gmbh';
    expect(r(host, '/b/karte', after)).toMatchObject({
      authRequired: true,
      noindex: true,
      notFound: ['/b/404.html', '/b/404/index.html', '/404.html'],
    });
    expect(r(host, '/varianten', after).candidates[1]).toBe('/varianten/index.html');
    expect(r(host, '/module', after).candidates[1]).toBe('/module/index.html');
    expect(r(host, '/karte', after).notFound).toEqual(['/404.html']);
    expect(r(host, '/a/karte', after)).toMatchObject({ type: 'redirect', location: '/karte' });
    expect(r('localhost', '/robots.txt', after).body).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('normalizePath (Traversal)', () => {
  it('lehnt .., kodierte Slashes, Backslashes und NUL ab', () => {
    for (const p of ['/../etc/passwd', '/%2e%2e/x', '/a/..%2f..%2fx', '/x%2fy', '/x%5cy', '/x%00', '/%zz', '/./x']) {
      expect(normalizePath(p), p).toMatchObject({ ok: false });
    }
    expect(r('localhost', '/%2e%2e/outside.txt')).toMatchObject({ type: 'error', status: 400 });
  });
  it('dekodiert Umlaute', () => {
    expect(normalizePath('/%C3%BCber')).toMatchObject({ ok: true, path: '/über' });
  });
});

describe('robotsTxt', () => {
  it('liefert Allow nur für öffentlich', () => {
    expect(robotsTxt(true, 'sauerundsaftig.de')).toContain('Allow: /');
    expect(robotsTxt(false, 'sauerundsaftig.de')).toBe('User-agent: *\nDisallow: /\n');
  });
});
