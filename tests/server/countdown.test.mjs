/**
 * Countdown-Bühne (Präsentation): vor Go-Live zeigt "/" auf dem Live-Host ohne Session den
 * Countdown (200, privat, noindex) statt der Login-Umleitung; /countdown ist dann für alle
 * erreichbar. Ab Go-Live: "/" = echte Startseite, /countdown → "/".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AFTER_GO_LIVE, BEFORE_GO_LIVE, login, request, startTestServer } from './helpers.mjs';

const LIVE = 'sauerundsaftig.de';
const PREVIEW = 'sauerundsaftig.jawollja.gmbh';
let srv;
let cookie;

beforeAll(async () => {
  srv = await startTestServer();
  ({ cookie } = await login(srv.port, { host: LIVE, ip: '10.0.1.1' }));
});
afterAll(async () => {
  await srv?.stop();
});

const get = (host, p, headers = {}) => request(srv.port, { host, path: p, headers });
const isCountdown = (res) => res.text.includes('data-countdown');

describe('Countdown vor Go-Live', () => {
  it('"/" ohne Session → Countdown (200, privat, noindex) statt Login', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    const res = await get(LIVE, '/');
    expect(res.status).toBe(200);
    expect(isCountdown(res)).toBe(true);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
  });
  it('"/" mit Session → echte Startseite (Team-Vorschau)', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    const res = await get(LIVE, '/', { Cookie: cookie });
    expect(res.status).toBe(200);
    expect(isCountdown(res)).toBe(false);
  });
  it('/countdown für alle erreichbar, auch angemeldet', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    expect(isCountdown(await get(LIVE, '/countdown'))).toBe(true);
    expect(isCountdown(await get(LIVE, '/countdown', { Cookie: cookie }))).toBe(true);
  });
  it('Unterseiten bleiben hinter dem Login', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    const res = await get(LIVE, '/karte');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?next=%2Fkarte');
  });
  it('Vorschau-Host zeigt ohne Session keinen Countdown, sondern Login', async () => {
    srv.clock.set(BEFORE_GO_LIVE);
    const res = await get(PREVIEW, '/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });
});

describe('Countdown ab Go-Live', () => {
  it('"/" ohne Session → echte Startseite, öffentlich', async () => {
    srv.clock.set(AFTER_GO_LIVE);
    const res = await get(LIVE, '/');
    expect(res.status).toBe(200);
    expect(isCountdown(res)).toBe(false);
    expect(res.headers['x-robots-tag']).toBeUndefined();
  });
  it('/countdown → 302 auf die Startseite', async () => {
    srv.clock.set(AFTER_GO_LIVE);
    const res = await get(LIVE, '/countdown');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});
