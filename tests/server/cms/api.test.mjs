/**
 * CMS-API: Zustand, Entwurf speichern (Revisionen, 409, 422, 413), Verwerfen, Versionen, Wiederherstellen,
 * Nachspielen serverseitiger Änderungen, Prüf-Endpunkt, Audit-Log.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cmsApi, editDraft, getDraft, loginAs, startCms, testImage, textPage, upload } from './helpers.mjs';
import { request } from '../helpers.mjs';

let srv;
let cookie;
beforeEach(async () => {
  srv = await startCms();
  cookie = await loginAs(srv.port, 'konrad');
});
afterEach(() => srv?.stop());

const api = (method, p, body) => cmsApi(srv.port, cookie, method, p, body);

describe('GET /api/cms/state', () => {
  it('Erststart: Seed als Entwurf und veröffentlichter Stand (Revision 1), Image-dist ist online', async () => {
    const res = await api('GET', '/state');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const s = res.json;
    expect(s.draftMeta.revision).toBe(1);
    expect(s.publishedMeta).toMatchObject({ revision: 1, publishedBy: 'seed' });
    expect(s.dirty).toBe(false);
    expect(s.draft.settings.name).toBe('Sauer & Saftig');
    expect(s.draft.meta).toEqual(s.draftMeta);
    expect(s.online).toMatchObject({ id: 'image', revision: 1, image: true, codeVersion: 'test-1' });
    expect(s.live).toMatchObject({ kind: 'live', state: 'ok', revision: 1 });
    expect(s.preview).toBeNull();
    expect(s.codeVersion).toBe('test-1');
    expect(s.issues.errors).toEqual([]);
    expect(Array.isArray(s.issues.warnings)).toBe(true);
    expect(srv.builder.calls).toHaveLength(0); // Image-dist passt zum Seed → kein Build beim Start
  });
});

describe('PUT /api/cms/draft', () => {
  it('speichert, erhöht die Revision, markiert dirty und schreibt ein Audit-Event', async () => {
    const res = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Neuer Claim';
    });
    expect(res.status).toBe(200);
    expect(res.json.revision).toBe(2);
    expect(typeof res.json.updatedAt).toBe('string');
    const st = (await api('GET', '/state')).json;
    expect(st.draft.settings.claim).toBe('Neuer Claim');
    expect(st.draftMeta).toMatchObject({ revision: 2, updatedBy: 'konrad' });
    expect(st.dirty).toBe(true);
    expect(st.publishedMeta.revision).toBe(1);
    const events = (await readFile(path.join(srv.dataDir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(events.at(-1)).toMatchObject({ user: 'konrad', action: 'cms.draft.save', revision: 2, base: 1 });
  });

  it('GET /published liefert den veröffentlichten Stand ohne meta (Vergleichsbasis fürs Dashboard)', async () => {
    const res = await api('GET', '/published');
    expect(res.status).toBe(200);
    expect(res.json.meta.revision).toBe(1);
    expect(res.json.doc.meta).toBeUndefined();
    expect(Array.isArray(res.json.doc.pages)).toBe(true);
    expect(res.json.doc.settings.name).toBe('Sauer & Saftig');
    expect((await request(srv.port, { path: '/api/cms/published', host: 'localhost' })).status).toBe(401);
  });

  it('veraltete Basis-Revision → 409 mit aktuellem Stand', async () => {
    const { doc } = await getDraft(srv.port, cookie);
    expect((await api('PUT', '/draft', { doc, baseRevision: 1 })).status).toBe(200);
    const conflict = await api('PUT', '/draft', { doc, baseRevision: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.json).toMatchObject({ revision: 2, updatedBy: 'konrad', baseRevision: 1 });
    expect(conflict.json.error).toMatch(/inzwischen geändert/);
    expect((await api('PUT', '/draft', { doc, baseRevision: 99 })).status).toBe(409);
    expect((await api('PUT', '/draft', { doc })).status).toBe(400);
  });

  it('Fehler → 422 mit Pfad und verständlicher Meldung, nichts gespeichert', async () => {
    let idx = -1; // Index der neuen Seite (der Seed bringt bereits Seiten mit)
    const res = await editDraft(srv.port, cookie, (d) => {
      idx = d.pages.length;
      d.pages.push({ ...textPage('neu', 'admin'), sections: [{ id: 'x', type: 'gibtsnicht', visible: true, fields: {} }] });
    });
    expect(res.status).toBe(422);
    const paths = res.json.errors.map((e) => e.path);
    expect(paths).toContain(`pages.${idx}.slug`);
    expect(paths).toContain(`pages.${idx}.sections.0.type`);
    expect(res.json.errors.find((e) => e.path === `pages.${idx}.slug`).message).toMatch(/reserviert/);
    expect((await api('GET', '/state')).json.draftMeta.revision).toBe(1);
  });

  it('Entwurf darf unvollständig sein (Warnung), Veröffentlichen nicht (422)', async () => {
    let idx = -1;
    const res = await editDraft(srv.port, cookie, (d) => {
      const p = textPage('neu', 'neu');
      p.sections[0].fields.title = '';
      idx = d.pages.length;
      d.pages.push(p);
    });
    expect(res.status).toBe(200);
    expect(res.json.warnings.some((w) => w.path === `pages.${idx}.sections.0.fields.title` && /Pflichtfeld/.test(w.message))).toBe(true);
    const pub = await api('POST', '/publish', { revision: res.json.revision });
    expect(pub.status).toBe(422);
    expect(pub.json.errors[0].message).toMatch(/Seite „Testseite“ › Abschnitt „Text“ › Überschrift: Pflichtfeld ist leer/);
  });

  it('zu großer Body → 413, kein JSON → 415/400', async () => {
    const big = await api('PUT', '/draft', { doc: { x: 'a'.repeat(6 * 1024 * 1024 + 10) }, baseRevision: 1 });
    expect(big.status).toBe(413);
    const noJson = await cmsApi(srv.port, cookie, 'PUT', '/draft', undefined, { headers: { 'Content-Type': 'text/plain' } });
    expect(noJson.status).toBe(415);
    const broken = await cmsApi(srv.port, cookie, 'PUT', '/draft', '{kaputt', {});
    expect(broken.status).toBe(400);
  });

  it('Bild-Upload zwischen Laden und Speichern geht nicht verloren (Nachspielen statt 409)', async () => {
    const { doc, revision } = await getDraft(srv.port, cookie);
    const up = await upload(srv.port, cookie, await testImage(), { filename: 'Theke Neu.jpg', alt: 'Theke' });
    expect(up.status).toBe(201);
    expect(up.headers['x-cms-revision']).toBe(String(revision + 1));
    doc.settings.claim = 'Mit altem Stand gespeichert';
    const put = await api('PUT', '/draft', { doc, baseRevision: revision });
    expect(put.status).toBe(200);
    const st = (await api('GET', '/state')).json;
    expect(st.draft.settings.claim).toBe('Mit altem Stand gespeichert');
    expect(st.draft.media.some((m) => m.id === 'theke-neu')).toBe(true);
    // nach einem vollständigen Speichern gilt die alte Basis nicht mehr
    expect((await api('PUT', '/draft', { doc, baseRevision: revision })).status).toBe(409);
  });
});

describe('Verwerfen, Versionen, Wiederherstellen', () => {
  it('discard: Entwurf = veröffentlichter Stand', async () => {
    await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Wird verworfen';
    });
    const res = await api('POST', '/draft/discard', {});
    expect(res.status).toBe(200);
    expect(res.json.revision).toBe(3);
    const st = (await api('GET', '/state')).json;
    expect(st.dirty).toBe(false);
    expect(st.draft.settings.claim).not.toBe('Wird verworfen');
  });

  it('Veröffentlichen legt Versionen an; Wiederherstellen holt eine Version in den Entwurf', async () => {
    const first = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Version A';
    });
    expect((await api('POST', '/publish', { revision: first.json.revision })).status).toBe(202);
    const second = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Version B';
    });
    expect((await api('POST', '/publish', { revision: second.json.revision })).status).toBe(202);
    await srv.cms.builds.idle();
    const versions = (await api('GET', '/versions')).json;
    expect(versions.map((v) => v.revision)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ publishedBy: 'konrad' });
    expect(versions[0].id).toMatch(/^\d{8}T\d{9}Z-r3$/);
    const restore = await api('POST', `/versions/${versions[1].id}/restore`, {});
    expect(restore.status).toBe(200);
    const st = (await api('GET', '/state')).json;
    expect(st.draft.settings.claim).toBe('Version A');
    expect(st.draftMeta.revision).toBe(restore.json.revision);
    expect(st.dirty).toBe(true);
    expect((await api('POST', '/versions/20260101T000000000Z-r9/restore', {})).status).toBe(404);
    expect((await api('POST', '/versions/..%2Fdraft/restore', {})).status).toBe(400);
  });

  it('unveränderter Inhalt erzeugt keine neue Version (nur Neubau)', async () => {
    const res = await api('POST', '/publish', { revision: 1 });
    expect(res.status).toBe(202);
    expect(res.json.changed).toBe(false);
    expect((await api('GET', '/versions')).json).toHaveLength(1);
  });
});

describe('POST /api/cms/validate', () => {
  it('prüft ein übergebenes Dokument ohne zu speichern', async () => {
    const { doc } = await getDraft(srv.port, cookie);
    doc.navigation.main[0].href = 'javascript:alert(1)';
    const res = await api('POST', '/validate', { doc });
    expect(res.status).toBe(200);
    expect(res.json.errors).toEqual([expect.objectContaining({ path: 'navigation.main.0.href' })]);
    expect(res.json.errors[0].message).toMatch(/nicht erlaubt/);
  });
});
