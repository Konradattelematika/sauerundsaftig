/**
 * Benutzerverwaltung: Env-Benutzer als Bootstrap, Dashboard-Benutzer in users.json, Rollen,
 * Passwortregeln, Sessions nach Änderungen, Schutz des letzten Admins, /passwort für Dashboard-Benutzer.
 */
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../../server/lib/auth.mjs';
import { login, request } from '../helpers.mjs';
import { CMS_PASSWORDS, cmsApi, loginAs, startCms } from './helpers.mjs';

let srv;
afterEach(async () => {
  await srv?.stop();
  srv = undefined;
});

const PW = 'ein-langes-passwort-1';

describe('Benutzerverwaltung', () => {
  it('Liste: Env-Benutzer mit wirksamer Rolle, ohne Hashes', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    const res = await cmsApi(srv.port, admin, 'GET', '/users');
    expect(res.status).toBe(200);
    expect(res.json.map((u) => [u.id, u.role, u.source, u.editable])).toEqual([
      ['konrad', 'admin', 'env', false],
      ['josie', 'admin', 'env', false],
      ['rita', 'redaktion', 'env', false],
    ]);
    expect(res.text).not.toContain('scrypt');
  });

  it('anlegen → anmelden → Rolle ändern → löschen (Sessions werden ungültig)', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    const created = await cmsApi(srv.port, admin, 'POST', '/users', { id: 'Mia', name: ' Mia  Muster ', role: 'redaktion', password: PW });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ id: 'mia', name: 'Mia Muster', role: 'redaktion', source: 'dashboard', editable: true, createdBy: 'konrad' });
    const stored = await readFile(path.join(srv.dataDir, 'users.json'), 'utf8');
    expect(stored).not.toContain(PW);
    expect(JSON.parse(stored).users[0].hash).toMatch(/^scrypt\$32768\$/);

    const { res, cookie: mia } = await login(srv.port, { user: 'mia', password: PW, ip: '10.1.1.1' });
    expect(res.headers.location).toBe('/');
    expect((await cmsApi(srv.port, mia, 'GET', '/state')).json.me).toMatchObject({ id: 'mia', role: 'redaktion' });
    expect((await cmsApi(srv.port, mia, 'GET', '/users')).status).toBe(403);

    const promoted = await cmsApi(srv.port, admin, 'PATCH', '/users/mia', { role: 'admin' });
    expect(promoted.json.role).toBe('admin');
    expect((await cmsApi(srv.port, mia, 'GET', '/users')).status).toBe(200); // wirkt sofort

    const del = await cmsApi(srv.port, admin, 'DELETE', '/users/mia');
    expect(del.json).toEqual({ deleted: 'mia' });
    expect((await cmsApi(srv.port, mia, 'GET', '/state')).status).toBe(401);
    expect((await login(srv.port, { user: 'mia', password: PW, ip: '10.1.1.2' })).res.headers.location).toBe('/login?fehler=1');
  });

  it('Validierung: Passwort ≥ 10 Zeichen, gültige ID/Rolle, keine Doppelten', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    const cases = [
      [{ id: 'kurz', password: 'neun12345' }, 422, /mindestens 10 Zeichen/],
      [{ id: 'ä', password: PW }, 422, /Benutzername/],
      [{ id: 'x', password: PW, role: 'chef' }, 422, /Rolle/],
      [{ id: 'josie', password: PW }, 409, /gibt es schon/],
    ];
    for (const [body, status, msg] of cases) {
      const res = await cmsApi(srv.port, admin, 'POST', '/users', body);
      expect(res.status, JSON.stringify(body)).toBe(status);
      expect(res.json.error).toMatch(msg);
    }
    expect((await cmsApi(srv.port, admin, 'PATCH', '/users/gibtsnicht', { name: 'x' })).status).toBe(404);
    expect((await cmsApi(srv.port, admin, 'PATCH', '/users/rita', {})).status).toBe(422);
  });

  it('Env-Benutzer: Name/Rolle/Löschen nur per Konfiguration, Passwort-Reset geht (passwords.json)', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    const rita = await loginAs(srv.port, 'rita');
    expect((await cmsApi(srv.port, admin, 'PATCH', '/users/rita', { role: 'admin' })).status).toBe(409);
    expect((await cmsApi(srv.port, admin, 'DELETE', '/users/rita')).status).toBe(409);
    const reset = await cmsApi(srv.port, admin, 'PATCH', '/users/rita', { password: PW });
    expect(reset.status).toBe(200);
    expect((await cmsApi(srv.port, rita, 'GET', '/state')).status).toBe(401); // alte Session ungültig
    expect((await login(srv.port, { user: 'rita', password: PW, ip: '10.1.2.1' })).res.headers.location).toBe('/');
    const pw = JSON.parse(await readFile(path.join(srv.dataDir, 'passwords.json'), 'utf8'));
    expect(pw.rita.hash).toMatch(/^scrypt\$/);
  });

  it('eigenes Passwort im Dashboard ändern → neues Cookie, Sitzung bleibt', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    const res = await cmsApi(srv.port, admin, 'PATCH', '/users/konrad', { password: PW });
    expect(res.status).toBe(200);
    const fresh = [res.headers['set-cookie']].flat()[0].split(';')[0];
    expect((await cmsApi(srv.port, fresh, 'GET', '/state')).status).toBe(200);
    expect((await cmsApi(srv.port, admin, 'GET', '/state')).status).toBe(401);
  });

  it('letzter Admin: nicht herabstufen, nicht löschen; sich selbst nie löschen', async () => {
    // Env enthält nur eine Redakteurin, der einzige Admin kommt aus users.json
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sus-cms-data-'));
    await writeFile(
      path.join(dataDir, 'users.json'),
      JSON.stringify({ users: [{ id: 'boss', name: 'Boss', role: 'admin', hash: await hashPassword(PW, { N: 1024 }) }] }),
    );
    const usersJson = JSON.stringify([{ id: 'rita', name: 'Rita', role: 'redaktion', hash: await hashPassword(CMS_PASSWORDS.rita, { N: 1024 }) }]);
    srv = await startCms({ dataDir, usersJson });
    const { cookie: boss } = await login(srv.port, { user: 'boss', password: PW, ip: '10.1.3.1' });
    const down = await cmsApi(srv.port, boss, 'PATCH', '/users/boss', { role: 'redaktion' });
    expect(down.status).toBe(409);
    expect(down.json.error).toMatch(/mindestens ein Admin/);
    expect((await cmsApi(srv.port, boss, 'DELETE', '/users/boss')).json.error).toMatch(/nicht selbst löschen/);
    // zweiter Admin → jetzt darf boss herabgestuft werden
    expect((await cmsApi(srv.port, boss, 'POST', '/users', { id: 'chef', role: 'admin', password: PW })).status).toBe(201);
    expect((await cmsApi(srv.port, boss, 'PATCH', '/users/boss', { role: 'redaktion' })).status).toBe(200);
    expect((await cmsApi(srv.port, boss, 'GET', '/users')).status).toBe(403);
    const { cookie: chef } = await login(srv.port, { user: 'chef', password: PW, ip: '10.1.3.2' });
    const lastDel = await cmsApi(srv.port, chef, 'PATCH', '/users/chef', { role: 'redaktion' });
    expect(lastDel.status).toBe(409);
  });

  it('/passwort funktioniert auch für Dashboard-Benutzer (users.json)', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    await cmsApi(srv.port, admin, 'POST', '/users', { id: 'mia', password: PW });
    const { cookie: mia } = await login(srv.port, { user: 'mia', password: PW, ip: '10.1.4.1' });
    const NEW = 'noch-ein-passwort-22';
    const res = await request(srv.port, {
      method: 'POST',
      path: '/passwort',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: mia, 'X-Forwarded-For': '10.1.4.2' },
      body: new URLSearchParams({ current: PW, password: NEW, password2: NEW }).toString(),
    });
    expect(res.headers.location).toBe('/passwort?ok=1');
    expect((await login(srv.port, { user: 'mia', password: NEW, ip: '10.1.4.3' })).res.headers.location).toBe('/');
    const stored = JSON.parse(await readFile(path.join(srv.dataDir, 'users.json'), 'utf8'));
    expect(stored.users[0]).toMatchObject({ id: 'mia', updatedBy: 'mia' });
  });

  it('Neustart: Dashboard-Benutzer bleiben, kaputte/kollidierende Einträge werden ignoriert', async () => {
    srv = await startCms();
    const admin = await loginAs(srv.port, 'konrad');
    await cmsApi(srv.port, admin, 'POST', '/users', { id: 'mia', password: PW, role: 'redaktion' });
    const file = path.join(srv.dataDir, 'users.json');
    const data = JSON.parse(await readFile(file, 'utf8'));
    data.users.push({ id: 'konrad', role: 'admin', hash: data.users[0].hash }, { id: 'kaputt', role: 'admin', hash: 'klartext' });
    await writeFile(file, JSON.stringify(data));
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });
    srv = await startCms(opts);
    const admin2 = await loginAs(srv.port, 'konrad');
    const list = (await cmsApi(srv.port, admin2, 'GET', '/users')).json;
    expect(list.map((u) => u.id)).toEqual(['konrad', 'josie', 'rita', 'mia']);
    expect((await login(srv.port, { user: 'mia', password: PW, ip: '10.1.5.1' })).res.headers.location).toBe('/');
    await mkdir(path.join(srv.dataDir, 'x'), { recursive: true });
  });
});
