/**
 * Rollen & Rechte (CMS-PLAN §7.2) und Erreichbarkeit von /api/cms/* und /admin auf allen Hosts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { route } from '../../../server/lib/host-policy.mjs';
import { PERMISSIONS, can, effectiveRole, permissionsFor } from '../../../server/lib/cms/users.mjs';
import { AFTER_GO_LIVE, BEFORE_GO_LIVE, request } from '../helpers.mjs';
import { cmsApi, getDraft, loginAs, startCms, testImage, upload } from './helpers.mjs';

const LIVE = 'sauerundsaftig.de';
const CHECK = 'checkliste.sauerundsaftig.de';

describe('Rollen → Rechte', () => {
  it('admin (auch team/inhaberin) hat alles, redaktion alles außer Benutzerverwaltung', () => {
    for (const role of ['admin', 'team', 'inhaberin']) {
      expect(effectiveRole(role)).toBe('admin');
      expect(permissionsFor(role)).toEqual(PERMISSIONS);
    }
    expect(effectiveRole('redaktion')).toBe('redaktion');
    expect(permissionsFor('redaktion')).toEqual(['cms.view', 'cms.edit', 'cms.publish', 'media.manage']);
    expect(permissionsFor('chef')).toEqual([]);
    expect(can(null, 'cms.view')).toBe(false);
    expect(can({ role: 'redaktion' }, 'users.manage')).toBe(false);
  });
});

describe('Host-Routing für CMS', () => {
  const cfg = {
    liveHosts: ['sauerundsaftig.de'],
    wwwHosts: ['www.sauerundsaftig.de'],
    toolHosts: { 'checkliste.sauerundsaftig.de': 'checkliste' },
    goLiveAt: new Date('2026-10-10T14:00:00Z'),
    forcePrivate: false,
  };
  const r = (host, rawPath, now = BEFORE_GO_LIVE) => route({ method: 'GET', host, rawPath, search: '' }, cfg, now);
  it('/api/cms/* ist auf allen Hosts die CMS-API, übrige API auf dem Live-Host gesperrt', () => {
    for (const host of [LIVE, CHECK, 'localhost']) {
      const d = r(host, '/api/cms/state', AFTER_GO_LIVE);
      expect(d.type).toBe('cms-api');
      expect(d.apiSegments).toEqual(['state']);
      expect(d.noindex).toBe(true);
    }
    expect(r(LIVE, '/api/me').type).toBe('api-blocked');
  });
  it('/admin und /admin/vorschau auf allen Hosts, /admin/ → kanonisch', () => {
    expect(r(LIVE, '/admin', AFTER_GO_LIVE).type).toBe('admin');
    expect(r(CHECK, '/admin/seiten/start').type).toBe('admin');
    expect(r(LIVE, '/admin/vorschau').type).toBe('cms-preview-toggle');
    expect(r(LIVE, '/admin/').type).toBe('redirect');
  });
});

describe('Rechte-Matrix (Server)', () => {
  let srv;
  let admin;
  let red;
  beforeAll(async () => {
    srv = await startCms();
    admin = await loginAs(srv.port, 'konrad');
    red = await loginAs(srv.port, 'rita');
  });
  afterAll(() => srv?.stop());

  const routes = [
    ['GET', '/state'],
    ['PUT', '/draft', {}],
    ['POST', '/draft/discard', {}],
    ['POST', '/preview', {}],
    ['POST', '/publish', { revision: 1 }],
    ['GET', '/build'],
    ['GET', '/versions'],
    ['GET', '/media/brot-laib/file'],
    ['DELETE', '/media/brot-laib'],
    ['GET', '/users'],
    ['POST', '/users', {}],
    ['PATCH', '/users/rita', {}],
    ['DELETE', '/users/rita'],
  ];

  it('ohne Session: 401 für alle CMS-Routen', async () => {
    for (const [method, p, body] of routes) {
      const res = await cmsApi(srv.port, null, method, p, body);
      expect(res.status, `${method} ${p}`).toBe(401);
      expect(res.json.error).toBe('Nicht angemeldet');
    }
  });

  it('Redaktion: Inhalte, Medien, Veröffentlichen ja — Benutzerverwaltung 403', async () => {
    const st = await cmsApi(srv.port, red, 'GET', '/state');
    expect(st.status).toBe(200);
    expect(st.json.me).toEqual({ id: 'rita', name: 'Rita', role: 'redaktion', permissions: ['cms.view', 'cms.edit', 'cms.publish', 'media.manage'] });
    const { doc, revision } = await getDraft(srv.port, red);
    doc.settings.claim = 'Redaktion war hier';
    const put = await cmsApi(srv.port, red, 'PUT', '/draft', { doc, baseRevision: revision });
    expect(put.status).toBe(200);
    expect((await upload(srv.port, red, await testImage())).status).toBe(201);
    const pub = await cmsApi(srv.port, red, 'POST', '/publish', { revision: put.json.revision + 1 });
    expect(pub.status).toBe(202);
    await srv.cms.builds.idle();
    for (const [method, p, body] of [
      ['GET', '/users'],
      ['POST', '/users', { id: 'x', password: 'x'.repeat(12) }],
      ['PATCH', '/users/konrad', { password: 'y'.repeat(12) }],
      ['DELETE', '/users/konrad'],
    ]) {
      const res = await cmsApi(srv.port, red, method, p, body);
      expect(res.status, `${method} ${p}`).toBe(403);
      expect(res.json.permission).toBe('users.manage');
    }
  });

  it('Admin (Altrolle team): alles inkl. Benutzerverwaltung', async () => {
    const st = await cmsApi(srv.port, admin, 'GET', '/state');
    expect(st.json.me.role).toBe('admin');
    expect(st.json.me.permissions).toEqual(PERMISSIONS);
    expect((await cmsApi(srv.port, admin, 'GET', '/users')).status).toBe(200);
  });

  it('schreibend: fremde Herkunft 403, falscher Content-Type 415', async () => {
    const foreign = await cmsApi(srv.port, admin, 'POST', '/preview', {}, { headers: { Origin: 'https://evil.example' } });
    expect(foreign.status).toBe(403);
    const form = await request(srv.port, {
      method: 'POST',
      path: '/api/cms/draft/discard',
      headers: { Cookie: admin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=1',
    });
    expect(form.status).toBe(415);
    const wrongMethod = await cmsApi(srv.port, admin, 'DELETE', '/state');
    expect(wrongMethod.status).toBe(405);
    expect((await cmsApi(srv.port, admin, 'GET', '/gibtsnicht')).status).toBe(404);
  });

  it('/api/cms und /admin auf dem Live-Host — auch nach Go-Live nur mit Login', async () => {
    srv.clock.set(AFTER_GO_LIVE);
    try {
      expect((await cmsApi(srv.port, null, 'GET', '/state', undefined, { host: LIVE })).status).toBe(401);
      const liveCookie = await loginAs(srv.port, 'konrad', { host: LIVE });
      const st = await cmsApi(srv.port, liveCookie, 'GET', '/state', undefined, { host: LIVE });
      expect(st.status).toBe(200);
      expect(st.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
      const anonAdmin = await request(srv.port, { host: LIVE, path: '/admin' });
      expect(anonAdmin.status).toBe(302);
      expect(anonAdmin.headers.location).toBe('/login?next=%2Fadmin');
      const adminPage = await request(srv.port, { host: LIVE, path: '/admin', headers: { Cookie: liveCookie } });
      expect(adminPage.status).toBe(200);
      expect(adminPage.headers['cache-control']).toBe('private, no-store');
      expect(adminPage.text).toContain('admin-app');
    } finally {
      srv.clock.set(BEFORE_GO_LIVE);
    }
  });

  it('/admin: Unterpfade liefern die Admin-App, ohne Session Login mit Rücksprung', async () => {
    const sub = await request(srv.port, { path: '/admin/seiten/start?x=1', headers: { Cookie: red } });
    expect(sub.status).toBe(200);
    expect(sub.text).toContain('admin-app');
    const anon = await request(srv.port, { host: CHECK, path: '/admin/seiten?x=1' });
    expect(anon.status).toBe(302);
    expect(anon.headers.location).toBe('/login?next=%2Fadmin%2Fseiten%3Fx%3D1');
    const post = await request(srv.port, { method: 'POST', path: '/admin', headers: { Cookie: red } });
    expect(post.status).toBe(405);
  });
});
