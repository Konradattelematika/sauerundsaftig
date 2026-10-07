/**
 * /passwort — eigenes Passwort ändern: Seite nur angemeldet, Validierung, neue Session,
 * alte Sessions ungültig, Speicherung in <dataDir>/passwords.json, Admin-Reset per Env-Hash.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../server/lib/auth.mjs';
import { PASSWORDS, login, request, startTestServer, testUsers } from './helpers.mjs';

const CHECK = 'checkliste.sauerundsaftig.de';
const NEW_PW = 'neues-passwort-mit-krume-9';
let srv;

afterEach(async () => {
  await srv?.stop();
  srv = undefined;
});

function change(port, cookie, fields, { host = 'localhost', ip = '10.0.0.5' } = {}) {
  return request(port, {
    method: 'POST',
    path: '/passwort',
    host,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, 'X-Forwarded-For': ip },
    body: new URLSearchParams(fields).toString(),
  });
}

const valid = { current: PASSWORDS.konrad, password: NEW_PW, password2: NEW_PW };

describe('/passwort', () => {
  it('Seite nur mit Session, sonst Login mit Rücksprung', async () => {
    srv = await startTestServer();
    const anon = await request(srv.port, { path: '/passwort', host: CHECK });
    expect(anon.status).toBe(302);
    expect(anon.headers.location).toBe('/login?next=%2Fpasswort');
    const { cookie } = await login(srv.port);
    const page = await request(srv.port, { path: '/passwort', headers: { Cookie: cookie } });
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toBe('private, no-store');
    expect(page.text).toContain('Passwort ändern');
  });

  it('Validierung: falsches aktuelles, zu kurz, ungleich, unverändert', async () => {
    srv = await startTestServer();
    const { cookie } = await login(srv.port);
    const cases = [
      [{ ...valid, current: 'falsch-falsch-falsch' }, 'aktuell'],
      [{ ...valid, password: 'kurz', password2: 'kurz' }, 'kurz'],
      [{ ...valid, password2: `${NEW_PW}x` }, 'ungleich'],
      [{ ...valid, password: PASSWORDS.konrad, password2: PASSWORDS.konrad }, 'gleich'],
    ];
    for (const [fields, code] of cases) {
      const res = await change(srv.port, cookie, fields);
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(`/passwort?fehler=${code}`);
    }
    // nichts geändert: altes Passwort gilt weiter
    expect((await login(srv.port, { ip: '10.0.0.6' })).res.status).toBe(303);
    expect((await login(srv.port, { ip: '10.0.0.6' })).res.headers.location).toBe('/');
  });

  it('fremde Herkunft und fehlende Session werden abgelehnt', async () => {
    srv = await startTestServer();
    const { cookie } = await login(srv.port);
    const foreign = await request(srv.port, {
      method: 'POST',
      path: '/passwort',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, Origin: 'https://evil.example' },
      body: new URLSearchParams(valid).toString(),
    });
    expect(foreign.status).toBe(403);
    const anon = await change(srv.port, '', valid);
    expect(anon.status).toBe(303);
    expect(anon.headers.location).toBe('/login?next=%2Fpasswort');
  });

  it('Änderung: neues Cookie, alte Sessions ungültig, neues Passwort gilt, altes nicht', async () => {
    srv = await startTestServer();
    const { cookie: oldCookie } = await login(srv.port);
    const { cookie: otherDevice } = await login(srv.port, { ip: '10.0.0.7' });
    const res = await change(srv.port, oldCookie, valid);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/passwort?ok=1');
    const newCookie = [res.headers['set-cookie']].flat()[0].split(';')[0];

    const withNew = await request(srv.port, { path: '/api/me', headers: { Cookie: newCookie } });
    expect(withNew.status).toBe(200);
    expect(withNew.json.user.id).toBe('konrad');
    for (const c of [oldCookie, otherDevice]) {
      expect((await request(srv.port, { path: '/api/me', headers: { Cookie: c } })).status).toBe(401);
    }
    expect((await login(srv.port, { ip: '10.0.0.8' })).res.headers.location).toBe('/login?fehler=1');
    expect((await login(srv.port, { ip: '10.0.0.8', password: NEW_PW })).res.headers.location).toBe('/');

    const stored = JSON.parse(await readFile(path.join(srv.config.dataDir, 'passwords.json'), 'utf8'));
    expect(stored.konrad.hash).toMatch(/^scrypt\$/);
    expect(stored.konrad.hash).not.toContain(NEW_PW);
    expect(stored.josie).toBeUndefined();
  });

  it('übersteht einen Neustart; neuer Env-Hash setzt das Passwort zurück (Admin-Reset)', async () => {
    // Gleiche Env über Neustarts hinweg (testUsers() salzt jedes Mal neu)
    const usersJson = JSON.stringify(await testUsers());
    srv = await startTestServer({ SUS_USERS: usersJson });
    const { cookie } = await login(srv.port);
    expect((await change(srv.port, cookie, valid)).headers.location).toBe('/passwort?ok=1');
    const dataDir = srv.config.dataDir;
    await srv.stop({ keepData: true });

    // Neustart mit gleicher Env: selbst gesetztes Passwort gilt
    srv = await startTestServer({ SUS_USERS: usersJson, SUS_DATA_DIR: dataDir });
    expect((await login(srv.port, { password: NEW_PW })).res.headers.location).toBe('/');
    await srv.stop({ keepData: true });

    // Neustart mit neuem Env-Hash für Konrad: der gilt wieder, der Override wird ignoriert
    const reset = 'admin-reset-passwort-1';
    const users = JSON.parse(usersJson);
    users.find((u) => u.id === 'konrad').hash = await hashPassword(reset, { N: 1024 });
    srv = await startTestServer({ SUS_USERS: JSON.stringify(users), SUS_DATA_DIR: dataDir });
    expect((await login(srv.port, { password: NEW_PW })).res.headers.location).toBe('/login?fehler=1');
    expect((await login(srv.port, { password: reset, ip: '10.0.0.9' })).res.headers.location).toBe('/');
    // Josie (unverändert) kommt weiter mit ihrem Passwort rein
    expect((await login(srv.port, { user: 'josie', ip: '10.0.0.10' })).res.headers.location).toBe('/');
  });
});
