/**
 * Veröffentlichen & Build-Pipeline mit Fake-Builder: Zeiger, Umschalten, Aufräumen, Fehler, Warteschlange,
 * Weiterleitungen bei Slug-Änderung, Start-Logik (Code-Version), echter Astro-Builder (Prozess, Env, Timeout).
 */
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { astroBuildEnv, createAstroBuilder } from '../../../server/lib/cms/astro-builder.mjs';
import { mergeRedirects, slugChangeRedirects } from '../../../server/lib/cms/content.mjs';
import { AFTER_GO_LIVE, request } from '../helpers.mjs';
import { cmsApi, editDraft, fakeBuilder, getDraft, loginAs, startCms, textPage } from './helpers.mjs';

let srv;
afterEach(async () => {
  await srv?.stop();
  srv = undefined;
});

async function publishClaim(claim, cookie) {
  const res = await editDraft(srv.port, cookie, (d) => {
    d.settings.claim = claim;
  });
  expect(res.status).toBe(200);
  const pub = await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: res.json.revision });
  expect(pub.status).toBe(202);
  return pub;
}

describe('Veröffentlichen', () => {
  it('202 → Build → Zeiger umgesetzt → Live liefert den neuen Stand, Entwurf sauber', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'josie');
    expect((await request(srv.port, { path: '/', headers: { Cookie: cookie } })).text).toContain('Image-Build');
    const pub = await publishClaim('Frisch veröffentlicht', cookie);
    expect(pub.json.build).toMatchObject({ kind: 'live', state: 'queued', revision: 2, requestedBy: 'josie' });
    expect(pub.json).toMatchObject({ revision: 2, changed: true, redirects: [] });
    await srv.cms.builds.idle();

    const build = (await cmsApi(srv.port, cookie, 'GET', '/build')).json;
    expect(build.live).toMatchObject({ kind: 'live', state: 'ok', revision: 2 });
    expect(build.live.logTail).toMatch(/fake: baue/);
    expect(build.online).toMatchObject({ revision: 2, codeVersion: 'test-1', image: false });

    const pointer = JSON.parse(await readFile(path.join(srv.dataDir, 'builds', 'current.json'), 'utf8'));
    expect(pointer).toMatchObject({ id: build.live.id, revision: 2, codeVersion: 'test-1' });
    expect(existsSync(path.join(srv.dataDir, 'builds', build.live.id, 'content.json'))).toBe(true);
    expect(existsSync(path.join(srv.dataDir, 'builds', 'logs', `${build.live.id}.log`))).toBe(true);

    const home = await request(srv.port, { path: '/', headers: { Cookie: cookie } });
    expect(home.text).toContain('Frisch veröffentlicht');
    expect(home.text).toContain('<p id="kind">live</p>');
    const call = srv.builder.calls[0];
    expect(call).toMatchObject({ kind: 'live', appDir: srv.appDir, cacheDir: path.join(srv.dataDir, 'astro-cache') });
    expect(call.outDir).toBe(path.join(srv.dataDir, 'builds', build.live.id, 'dist'));
    const st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.dirty).toBe(false);
    expect(st.publishedMeta).toMatchObject({ revision: 2, publishedBy: 'josie' });
  });

  it('nach Go-Live: Besucher sehen den neuen Build (öffentlich), Kompressions-Cache ist frisch', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    srv.clock.set(AFTER_GO_LIVE);
    const before = await request(srv.port, { host: 'sauerundsaftig.de', path: '/', headers: { 'Accept-Encoding': 'gzip' } });
    expect(before.status).toBe(200);
    await publishClaim('Nach Go-Live geändert', cookie);
    await srv.cms.builds.idle();
    const after = await request(srv.port, { host: 'sauerundsaftig.de', path: '/' });
    expect(after.text).toContain('Nach Go-Live geändert');
    expect(after.headers['cache-control']).toBe('no-cache');
  });

  it('alte Builds werden bis auf einen gelöscht', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    const ids = [];
    for (const claim of ['Eins', 'Zwei', 'Drei']) {
      await publishClaim(claim, cookie);
      await srv.cms.builds.idle();
      ids.push((await cmsApi(srv.port, cookie, 'GET', '/build')).json.live.id);
    }
    const dirs = readdirSync(path.join(srv.dataDir, 'builds')).filter((n) => /^\d{8}-/.test(n)).sort();
    expect(dirs).toEqual([ids[1], ids[2]].sort());
  });

  it('fehlgeschlagener Build: alte Version bleibt online, Status mit Fehler und Protokoll-Ende', async () => {
    srv = await startCms({ builder: fakeBuilder({ fail: true }) });
    const cookie = await loginAs(srv.port, 'konrad');
    await publishClaim('Kaputt', cookie);
    await srv.cms.builds.idle();
    const build = (await cmsApi(srv.port, cookie, 'GET', '/build')).json;
    expect(build.live).toMatchObject({ state: 'failed', revision: 2, error: expect.stringMatching(/Build fehlgeschlagen/) });
    expect(build.live.logTail).toMatch(/Syntaxfehler in Zeile 3/);
    expect(build.online).toMatchObject({ id: 'image', revision: 1 });
    expect(existsSync(path.join(srv.dataDir, 'builds', 'current.json'))).toBe(false);
    expect(existsSync(path.join(srv.dataDir, 'builds', build.live.id))).toBe(false);
    expect(existsSync(path.join(srv.dataDir, 'builds', 'logs', `${build.live.id}.log`))).toBe(true);
    expect((await request(srv.port, { path: '/', headers: { Cookie: cookie } })).text).toContain('Image-Build');
    const st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.publishedMeta.revision).toBe(2); // veröffentlicht, aber noch nicht online
    expect(st.online.revision).toBe(1);
  });

  it('Warteschlange: Live vor Vorschau, mehrere Anfragen werden zusammengefasst', async () => {
    srv = await startCms({ builder: fakeBuilder({ delayMs: 40 }) });
    const cookie = await loginAs(srv.port, 'konrad');
    const p1 = await cmsApi(srv.port, cookie, 'POST', '/preview', {});
    expect(p1.status).toBe(202);
    expect(p1.json.build).toMatchObject({ kind: 'preview', state: 'queued' });
    const p2 = await cmsApi(srv.port, cookie, 'POST', '/preview', {}); // läuft gerade → neuer Auftrag
    const p3 = await cmsApi(srv.port, cookie, 'POST', '/preview', {}); // wartet schon → zusammengefasst
    expect(p3.json.build.queuedAt).toBe(p2.json.build.queuedAt);
    await publishClaim('Live zuerst', cookie);
    await srv.cms.builds.idle();
    expect(srv.builder.calls.map((c) => c.kind)).toEqual(['preview', 'live', 'preview']);
  });

  it('veraltete Revision → 409, Fehler im Entwurf → 422', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    const res = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'x';
    });
    expect((await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: 1 })).status).toBe(409);
    expect((await cmsApi(srv.port, cookie, 'POST', '/publish', {})).status).toBe(400);
    const bad = await editDraft(srv.port, cookie, (d) => {
      d.settings.name = '';
    });
    expect(bad.status).toBe(200); // Entwurf darf unvollständig sein
    const pub = await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: bad.json.revision });
    expect(pub.status).toBe(422);
    expect(pub.json.errors).toEqual([expect.objectContaining({ path: 'settings.name' })]);
    expect(res.status).toBe(200);
    expect(srv.builder.calls).toHaveLength(0);
  });
});

describe('Weiterleitungen', () => {
  it('Slug-Änderung beim Veröffentlichen → 301 von der alten Adresse; Client mit alter Basis kann weiter speichern', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    const add = await editDraft(srv.port, cookie, (d) => {
      d.pages.push(textPage('aktion', 'aktion', 'Aktion'));
    });
    await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: add.json.revision });
    await srv.cms.builds.idle();
    expect((await request(srv.port, { path: '/aktion', headers: { Cookie: cookie } })).text).toContain('Aktion Überschrift');

    const { doc, revision } = await getDraft(srv.port, cookie);
    doc.pages.find((p) => p.slug === 'aktion').slug = 'angebote/herbst';
    const put = await cmsApi(srv.port, cookie, 'PUT', '/draft', { doc, baseRevision: revision });
    const pub = await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: put.json.revision });
    expect(pub.status).toBe(202);
    expect(pub.json.redirects).toEqual([{ from: '/aktion', to: '/angebote/herbst', status: 301 }]);
    expect(pub.json.draftRevision).toBe(put.json.revision + 1);
    await srv.cms.builds.idle();

    const old = await request(srv.port, { path: '/aktion?utm=1', headers: { Cookie: cookie } });
    expect(old.status).toBe(301);
    expect(old.headers.location).toBe('/angebote/herbst?utm=1');
    expect((await request(srv.port, { path: '/angebote/herbst', headers: { Cookie: cookie } })).status).toBe(200);
    srv.clock.set(AFTER_GO_LIVE);
    const pub301 = await request(srv.port, { host: 'sauerundsaftig.de', path: '/aktion' });
    expect(pub301.status).toBe(301);
    expect(pub301.headers['cache-control']).toBe('public, max-age=3600');

    // Client mit Stand vor dem Veröffentlichen speichert → Weiterleitung bleibt erhalten
    doc.settings.claim = 'Nach Umbenennung';
    const late = await cmsApi(srv.port, cookie, 'PUT', '/draft', { doc, baseRevision: put.json.revision });
    expect(late.status).toBe(200);
    const st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.draft.redirects).toEqual([expect.objectContaining({ from: '/aktion', to: '/angebote/herbst', status: 301 })]);

    // Zurückbenennen: neue Weiterleitung, die alte (jetzt Schleife) verschwindet
    const back = await editDraft(srv.port, cookie, (d) => {
      d.pages[0].slug = 'aktion';
    });
    const pub2 = await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: back.json.revision });
    expect(pub2.status).toBe(202);
    const st2 = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st2.draft.redirects.map((r) => [r.from, r.to])).toEqual([['/angebote/herbst', '/aktion']]);
    expect(st2.issues.errors).toEqual([]);
  });

  it('slugChangeRedirects / mergeRedirects: Vorlagen, Ketten, Startseite', () => {
    const page = (id, slug, extra = {}) => ({ id, slug, status: 'published', ...extra });
    const menu = [{ slug: 'kuchen' }, { slug: 'schnecken' }];
    const prev = { pages: [page('start', ''), page('karte-kat', 'karte/*', { template: 'menu-category' }), page('a', 'a')] };
    const next = {
      pages: [page('start', 'home'), page('karte-kat', 'speisekarte/*', { template: 'menu-category' }), page('a', 'b'), page('s', 'speisekarte/schnecken')],
      collections: { menu },
    };
    expect(slugChangeRedirects(prev, next)).toEqual([
      { from: '/karte/kuchen', to: '/speisekarte/kuchen', status: 301 },
      { from: '/a', to: '/b', status: 301 },
    ]);
    const merged = mergeRedirects([{ from: '/x', to: '/a', status: 301 }, { from: '/b', to: '/z', status: 301 }], [{ from: '/a', to: '/b', status: 301 }], 'T');
    expect(merged).toEqual([
      { from: '/x', to: '/b', status: 301 },
      { from: '/a', to: '/b', status: 301, createdAt: 'T' },
    ]);
  });
});

describe('Start-Logik', () => {
  it('neuer Code → beim Start neu bauen, bis dahin vorigen Build ausliefern; gleicher Stand → kein Build', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    await publishClaim('Stand vor Deploy', cookie);
    await srv.cms.builds.idle();
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });

    // gleicher Code, gleiche Revision → kein Build
    const same = fakeBuilder();
    srv = await startCms({ ...opts, builder: same });
    await srv.cms.builds.idle();
    expect(same.calls).toHaveLength(0);
    await srv.stop({ keepData: true });

    // neuer Code (Deploy) → Neubau; währenddessen liefert der Server den vorigen Build
    const slow = fakeBuilder({ delayMs: 80 });
    srv = await startCms({ ...opts, builder: slow, env: { SUS_CODE_VERSION: 'test-2' } });
    const cookie2 = await loginAs(srv.port, 'konrad');
    const during = await request(srv.port, { path: '/', headers: { Cookie: cookie2 } });
    expect(during.text).toContain('Stand vor Deploy');
    expect((await cmsApi(srv.port, cookie2, 'GET', '/build')).json.live).toMatchObject({ state: 'running', reason: expect.stringMatching(/neuer Code/) });
    await srv.cms.builds.idle();
    expect(slow.calls).toHaveLength(1);
    const online = (await cmsApi(srv.port, cookie2, 'GET', '/state')).json.online;
    expect(online).toMatchObject({ revision: 2, codeVersion: 'test-2' });
    await srv.stop();
  });

  it('SUS_BUILD_ON_START=0 unterdrückt den Neubau; .code-version im App-Verzeichnis zählt', async () => {
    srv = await startCms({ env: { SUS_CODE_VERSION: '' } });
    await writeFile(path.join(srv.appDir, '.code-version'), 'abc123\n');
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });
    const b = fakeBuilder();
    srv = await startCms({ ...opts, builder: b, env: { SUS_CODE_VERSION: '', SUS_BUILD_ON_START: '0' } });
    expect(srv.cms.codeVersion).toBe('abc123');
    await srv.cms.builds.idle();
    expect(b.calls).toHaveLength(0);
  });
});

describe('Astro-Builder (echter Kindprozess)', () => {
  let appDir;
  afterEach(async () => {
    if (appDir) await rm(appDir, { recursive: true, force: true });
  });

  async function fakeAstro(script) {
    appDir = await mkdtemp(path.join(os.tmpdir(), 'sus-astro-'));
    await mkdir(path.join(appDir, 'node_modules', 'astro'), { recursive: true });
    await writeFile(path.join(appDir, 'node_modules', 'astro', 'astro.js'), script);
    return appDir;
  }

  it('übergibt nur die Build-Umgebung (keine Secrets), Vorschau mit SUS_CMS_EDIT', async () => {
    const env = astroBuildEnv({ outDir: '/o', contentFile: '/c.json', cacheDir: '/cache', kind: 'preview', base: { PATH: '/bin', SUS_SESSION_SECRET: 'geheim', SUS_USERS: '[]' } });
    expect(env).toEqual({
      PATH: '/bin',
      NODE_ENV: 'production',
      ASTRO_TELEMETRY_DISABLED: '1',
      SUS_CMS_FILE: '/c.json',
      SUS_OUT_DIR: '/o',
      SUS_ASTRO_CACHE_DIR: '/cache',
      VIPS_CONCURRENCY: '1',
      UV_THREADPOOL_SIZE: '2',
      NODE_OPTIONS: '--max-old-space-size=1536',
      SUS_CMS_EDIT: '1',
    });
    const dir = await fakeAstro(`const fs=require('node:fs');fs.mkdirSync(process.env.SUS_OUT_DIR,{recursive:true});
fs.writeFileSync(process.env.SUS_OUT_DIR+'/index.html',JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),file:process.env.SUS_CMS_FILE,secret:process.env.SUS_SESSION_SECRET??null}));
console.log('gebaut');`);
    const lines = [];
    process.env.SUS_SESSION_SECRET = 'nicht-weitergeben';
    try {
      await createAstroBuilder()({ appDir: dir, outDir: path.join(dir, 'out'), contentFile: '/x.json', cacheDir: dir, kind: 'live', onLog: (l) => lines.push(l) });
    } finally {
      delete process.env.SUS_SESSION_SECRET;
    }
    const out = JSON.parse(await readFile(path.join(dir, 'out', 'index.html'), 'utf8'));
    expect(out).toEqual({ argv: ['build'], cwd: dir, file: '/x.json', secret: null });
    expect(lines).toContain('gebaut');
  });

  it('Exit-Code ≠ 0 → Fehler; Zeitüberschreitung beendet die Prozessgruppe', async () => {
    const dir = await fakeAstro(`console.error('kaputt'); process.exit(3);`);
    const lines = [];
    await expect(createAstroBuilder()({ appDir: dir, outDir: dir, contentFile: '', cacheDir: dir, kind: 'live', onLog: (l) => lines.push(l) })).rejects.toThrow(/Exit-Code 3/);
    expect(lines).toContain('kaputt');
    await writeFile(path.join(dir, 'node_modules', 'astro', 'astro.js'), `setInterval(() => {}, 1000);`);
    const t0 = Date.now();
    await expect(createAstroBuilder({ killGraceMs: 200 })({ appDir: dir, outDir: dir, contentFile: '', cacheDir: dir, kind: 'live', timeoutMs: 300 })).rejects.toThrow(/Zeitüberschreitung/);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
