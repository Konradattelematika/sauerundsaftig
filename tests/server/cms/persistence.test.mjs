/**
 * Neustart-Persistenz, Migrationen (mit Sicherung), Schreibschutz bei zu neuem Format, Selbstheilung.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDoc } from '../../../server/lib/cms/migrations.mjs';
import { request } from '../helpers.mjs';
import { cmsApi, editDraft, loginAs, startCms } from './helpers.mjs';

let srv;
afterEach(async () => {
  await srv?.stop();
  srv = undefined;
});

const MIGRATIONS = [
  {
    from: 1,
    to: 2,
    description: 'Claim bekommt Zusatz',
    up(doc) {
      doc.settings.claim = `${doc.settings.claim} (v2)`;
      return doc;
    },
  },
];

describe('Neustart', () => {
  it('Entwurf, veröffentlichter Stand, Versionen, Live-Build und Build-Status bleiben erhalten', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    const a = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Veröffentlicht';
    });
    await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: a.json.revision });
    await srv.cms.builds.idle();
    await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Nur Entwurf';
    });
    const before = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });

    srv = await startCms(opts);
    const cookie2 = await loginAs(srv.port, 'konrad');
    const after = (await cmsApi(srv.port, cookie2, 'GET', '/state')).json;
    expect(after.draftMeta).toEqual(before.draftMeta);
    expect(after.publishedMeta).toEqual(before.publishedMeta);
    expect(after.draft.settings.claim).toBe('Nur Entwurf');
    expect(after.dirty).toBe(true);
    expect(after.online).toEqual(before.online);
    expect(after.live).toMatchObject({ state: 'ok', revision: 2 });
    expect((await cmsApi(srv.port, cookie2, 'GET', '/versions')).json).toHaveLength(2);
    expect((await request(srv.port, { path: '/', headers: { Cookie: cookie2 } })).text).toContain('Veröffentlicht');
    expect(srv.builder.calls).toHaveLength(1); // kein Neubau nötig
  });

  it('Build lief beim Beenden → nach dem Start als fehlgeschlagen markiert, Neubau angestoßen', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    const a = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'x';
    });
    await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: a.json.revision });
    await srv.cms.builds.idle();
    const state = path.join(srv.dataDir, 'builds', 'state.json');
    const s = JSON.parse(await readFile(state, 'utf8'));
    s.preview = { id: null, kind: 'preview', state: 'running', revision: 2 };
    await writeFile(state, JSON.stringify(s));
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });
    srv = await startCms(opts);
    const cookie2 = await loginAs(srv.port, 'konrad');
    expect((await cmsApi(srv.port, cookie2, 'GET', '/build')).json.preview).toMatchObject({ state: 'failed', error: /neu gestartet/ });
  });

  it('kaputter Entwurf → gesichert, aus dem veröffentlichten Stand neu angelegt', async () => {
    srv = await startCms();
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });
    await writeFile(path.join(opts.dataDir, 'cms', 'draft.json'), '{kaputt');
    srv = await startCms(opts);
    const cookie = await loginAs(srv.port, 'konrad');
    const st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.draft.settings.name).toBe('Sauer & Saftig');
    expect(readdirSync(path.join(opts.dataDir, 'cms', 'backups')).some((f) => f.startsWith('draft-kaputt-'))).toBe(true);
  });
});

describe('Migrationen', () => {
  it('migrateDoc: Schritte der Reihe nach, zu neues Format → Fehler', () => {
    const { doc, applied } = migrateDoc({ schemaVersion: 1, settings: { claim: 'a' } }, { migrations: MIGRATIONS, target: 2 });
    expect(doc).toEqual({ schemaVersion: 2, settings: { claim: 'a (v2)' } });
    expect(applied).toEqual(['1→2: Claim bekommt Zusatz']);
    expect(() => migrateDoc({ schemaVersion: 3 }, { migrations: MIGRATIONS, target: 2 })).toThrow(/Formatversion 3/);
    expect(() => migrateDoc({ schemaVersion: 1 }, { migrations: [], target: 2 })).toThrow(/Keine Migration/);
  });

  it('beim Start: Entwurf und veröffentlichter Stand migriert, Sicherung angelegt, alte Clients bekommen 409', async () => {
    srv = await startCms();
    const cookie = await loginAs(srv.port, 'konrad');
    const old = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });

    srv = await startCms({ ...opts, cmsOptions: { migrations: MIGRATIONS, targetVersion: 2 } });
    const cookie2 = await loginAs(srv.port, 'konrad');
    const st = (await cmsApi(srv.port, cookie2, 'GET', '/state')).json;
    expect(st.draft.schemaVersion).toBe(2);
    expect(st.draft.settings.claim).toMatch(/\(v2\)$/);
    expect(st.draftMeta.revision).toBe(2);
    const backups = readdirSync(path.join(opts.dataDir, 'cms', 'backups'));
    expect(backups.some((f) => /^published-.*-v1\.json$/.test(f))).toBe(true);
    expect(backups.some((f) => /^draft-.*-v1\.json$/.test(f))).toBe(true);
    const events = await readFile(path.join(opts.dataDir, 'events.jsonl'), 'utf8');
    expect(events).toContain('"action":"cms.migrate"');

    const { meta, ...oldDoc } = old.draft;
    const conflict = await cmsApi(srv.port, cookie2, 'PUT', '/draft', { doc: oldDoc, baseRevision: meta.revision });
    expect(conflict.status).toBe(409);
    // alte Version (Format 1) wird beim Wiederherstellen migriert
    const [v1] = (await cmsApi(srv.port, cookie2, 'GET', '/versions')).json;
    const restored = await cmsApi(srv.port, cookie2, 'POST', `/versions/${v1.id}/restore`, {});
    expect(restored.status).toBe(200);
    expect((await cmsApi(srv.port, cookie2, 'GET', '/state')).json.draft.schemaVersion).toBe(2);
  });

  it('Inhalt neuer als der Code → schreibgeschützt (503), Website läuft weiter', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sus-cms-data-'));
    srv = await startCms({ dataDir });
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });
    const file = path.join(dataDir, 'cms', 'published.json');
    const doc = JSON.parse(await readFile(file, 'utf8'));
    doc.schemaVersion = 99;
    await writeFile(file, JSON.stringify(doc));
    srv = await startCms(opts);
    const cookie = await loginAs(srv.port, 'konrad');
    const st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.readOnly).toMatch(/Formatversion 99/);
    const put = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'x';
    });
    expect(put.status).toBe(503);
    expect((await request(srv.port, { path: '/', headers: { Cookie: cookie } })).status).toBe(200);
    expect(existsSync(path.join(dataDir, 'cms', 'draft.json'))).toBe(true);
    await mkdir(path.join(dataDir, 'tmp'), { recursive: true });
  });
});
