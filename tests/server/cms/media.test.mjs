/**
 * Medien: Upload (Magic Bytes, 15 MB, Normalisierung mit sharp), Ersetzen, Vorschaubilder mit Cache,
 * Löschschutz mit Verwendungsnachweis, Aufräumen, Sync nach src/assets/media beim Build.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sniffImage, slugifyName } from '../../../server/lib/cms/media.mjs';
import { request } from '../helpers.mjs';
import { cmsApi, editDraft, getDraft, loginAs, startCms, testImage, upload } from './helpers.mjs';

let srv;
let cookie;
beforeEach(async () => {
  srv = await startCms();
  cookie = await loginAs(srv.port, 'konrad');
});
afterEach(() => srv?.stop());

describe('Hilfsfunktionen', () => {
  it('sniffImage erkennt JPEG, PNG, WebP, AVIF — sonst null', async () => {
    expect(sniffImage(await testImage({ format: 'jpeg' }))).toBe('jpeg');
    expect(sniffImage(await testImage({ format: 'png' }))).toBe('png');
    expect(sniffImage(await testImage({ format: 'webp' }))).toBe('webp');
    expect(sniffImage(await testImage({ format: 'avif', width: 16, height: 16 }))).toBe('avif');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a...........'))).toBeNull();
  });
  it('slugifyName: Dateiname → ID', () => {
    expect(slugifyName('Käsekuchen Ü-Größe.JPG')).toBe('kaesekuchen-ue-groesse');
    expect(slugifyName('...')).toBe('bild');
  });
});

describe('POST /api/cms/media', () => {
  it('JPEG: gedreht nach EXIF, Metadaten entfernt, gespeichert, im Entwurf', async () => {
    const res = await upload(srv.port, cookie, await testImage({ width: 40, height: 20, orientation: 6 }), { filename: 'Theke Morgens.jpg', alt: 'Theke am Morgen – frisch' });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ id: 'theke-morgens', kind: 'upload', file: 'media/theke-morgens.jpg', alt: 'Theke am Morgen – frisch', width: 20, height: 40, createdBy: 'konrad' });
    const stored = await readFile(path.join(srv.dataDir, 'media', 'theke-morgens.jpg'));
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([20, 40]);
    const { doc } = await getDraft(srv.port, cookie);
    expect(doc.media.at(-1).id).toBe('theke-morgens');
    // gleicher Name → eindeutige ID und Datei
    const again = await upload(srv.port, cookie, await testImage(), { filename: 'Theke Morgens.jpg' });
    expect(again.json.id).toBe('theke-morgens-2');
    expect(again.json.file).toMatch(/^media\/theke-morgens-2\.jpg$/);
  });

  it('große Bilder werden auf 3000 px begrenzt, PNG bleibt PNG, AVIF wird WebP', async () => {
    const wide = await upload(srv.port, cookie, await testImage({ width: 3600, height: 40, format: 'png' }), { type: 'image/png', filename: 'banner.png' });
    expect(wide.status).toBe(201);
    expect(wide.json).toMatchObject({ width: 3000, height: 33, file: 'media/banner.png' });
    const avif = await upload(srv.port, cookie, await testImage({ width: 16, height: 16, format: 'avif' }), { type: 'image/avif', filename: 'a.avif' });
    expect(avif.status).toBe(201);
    expect(avif.json.file).toBe('media/a.webp');
  });

  it('falscher Inhalt → 415, falscher Content-Type → 415, zu groß → 413, leer → 400', async () => {
    const fake = await upload(srv.port, cookie, Buffer.from('<?php echo 1; ?>'.padEnd(64, ' ')), { type: 'image/png', filename: 'x.png' });
    expect(fake.status).toBe(415);
    expect(fake.json.error).toMatch(/JPEG, PNG, WebP oder AVIF/);
    const svg = await upload(srv.port, cookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), { type: 'image/svg+xml', filename: 'x.svg' });
    expect(svg.status).toBe(415);
    const text = await upload(srv.port, cookie, await testImage(), { type: 'text/plain' });
    expect(text.status).toBe(415);
    const huge = await upload(srv.port, cookie, Buffer.alloc(15 * 1024 * 1024 + 1, 0xff));
    expect(huge.status).toBe(413);
    const empty = await upload(srv.port, cookie, Buffer.alloc(0));
    expect(empty.status).toBe(400);
    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    expect((await upload(srv.port, cookie, corrupt)).status).toBe(415);
    expect((await getDraft(srv.port, cookie)).revision).toBe(1);
  });

  it('?replace= ersetzt ein Foto aus dem Grundbestand (replacedBy) bzw. einen Upload (file)', async () => {
    const res = await upload(srv.port, cookie, await testImage({ width: 60, height: 40 }), { replace: 'brot-laib', alt: 'Neues Brotfoto' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: 'brot-laib', kind: 'builtin', file: 'photos/brot-laib.jpg', replacedBy: 'media/brot-laib.jpg', alt: 'Neues Brotfoto', width: 60 });
    const up = await upload(srv.port, cookie, await testImage(), { filename: 'eigen.jpg' });
    const rep = await upload(srv.port, cookie, await testImage({ width: 30, height: 30 }), { replace: up.json.id });
    expect(rep.json.file).toMatch(/^media\/eigen-[0-9a-f]{6}\.jpg$/);
    expect(rep.json.replacedBy).toBeUndefined();
    expect((await upload(srv.port, cookie, await testImage(), { replace: 'gibtsnicht' })).status).toBe(404);
  });
});

describe('GET /api/cms/media/:id/file', () => {
  it('Vorschaubild (WebP, Breite gerundet) mit Cache und ETag; Original ohne w', async () => {
    const thumb = await request(srv.port, { path: '/api/cms/media/brot-laib/file?w=300', headers: { Cookie: cookie } });
    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/webp');
    expect(thumb.headers['cache-control']).toBe('private, no-cache');
    expect((await sharp(thumb.body).metadata()).width).toBe(320);
    const cached = readdirSync(path.join(srv.dataDir, 'media', '.thumbs'));
    expect(cached).toHaveLength(1);
    const again = await request(srv.port, { path: '/api/cms/media/brot-laib/file?w=300', headers: { Cookie: cookie, 'If-None-Match': thumb.headers.etag } });
    expect(again.status).toBe(304);
    const orig = await request(srv.port, { path: '/api/cms/media/brot-laib/file', headers: { Cookie: cookie } });
    expect(orig.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(orig.body).metadata()).width).toBe(800);
    // ersetztes Foto → Vorschau zeigt den Ersatz
    await upload(srv.port, cookie, await testImage({ width: 50, height: 50 }), { replace: 'brot-laib' });
    const replaced = await request(srv.port, { path: '/api/cms/media/brot-laib/file', headers: { Cookie: cookie } });
    expect((await sharp(replaced.body).metadata()).width).toBe(50);
  });

  it('unbekannt/fehlende Datei → 404, ohne Session → 401', async () => {
    expect((await request(srv.port, { path: '/api/cms/media/gibtsnicht/file', headers: { Cookie: cookie } })).status).toBe(404);
    expect((await request(srv.port, { path: '/api/cms/media/anstellgut/file', headers: { Cookie: cookie } })).status).toBe(404); // Platzhalter fehlt im Test-App-Verzeichnis
    expect((await request(srv.port, { path: '/api/cms/media/brot-laib/file' })).status).toBe(401);
    expect((await request(srv.port, { path: '/api/cms/media/brot-laib/file?w=abc', headers: { Cookie: cookie } })).status).toBe(400);
  });
});

describe('DELETE /api/cms/media/:id', () => {
  it('verwendetes Bild → 409 mit Verwendungsnachweis', async () => {
    const res = await cmsApi(srv.port, cookie, 'DELETE', '/media/kaesekuchen');
    expect(res.status).toBe(409);
    expect(res.json.usages).toEqual([{ path: 'collections.menu.1.items.0.motif', label: 'Karte › Kategorie „Kuchen“ › „Käsekuchen“ › Bild' }]);
  });

  it('Grundbestand nicht löschbar; unbenutzter Upload wird gelöscht, Datei später aufgeräumt', async () => {
    const builtin = await cmsApi(srv.port, cookie, 'DELETE', '/media/fassade');
    expect(builtin.status).toBe(409);
    expect(builtin.json.error).toMatch(/Grundbestand/);
    const up = await upload(srv.port, cookie, await testImage(), { filename: 'weg.jpg' });
    const file = path.join(srv.dataDir, 'media', 'weg.jpg');
    const del = await cmsApi(srv.port, cookie, 'DELETE', '/media/weg');
    expect(del.status).toBe(200);
    expect(del.json).toEqual({ deleted: 'weg' });
    expect((await getDraft(srv.port, cookie)).doc.media.some((m) => m.id === up.json.id)).toBe(false);
    expect(existsSync(file)).toBe(true); // frisch → bleibt (Schutz vor Upload-Rennen)
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(file, old, old);
    srv.clock.set(new Date());
    expect((await cmsApi(srv.port, cookie, 'POST', '/draft/discard', {})).status).toBe(200);
    expect(existsSync(file)).toBe(false);
    expect((await cmsApi(srv.port, cookie, 'DELETE', '/media/weg')).status).toBe(404);
  });

  it('wird ein gelöschtes Bild im alten Stand noch verwendet → 409 beim Speichern', async () => {
    const up = await upload(srv.port, cookie, await testImage(), { filename: 'kurz.jpg' });
    const { doc, revision } = await getDraft(srv.port, cookie);
    expect((await cmsApi(srv.port, cookie, 'DELETE', `/media/${up.json.id}`)).status).toBe(200);
    doc.layout.header.logo = { media: up.json.id };
    const put = await cmsApi(srv.port, cookie, 'PUT', '/draft', { doc, baseRevision: revision });
    expect(put.status).toBe(409);
    expect(put.json.error).toMatch(/gelöscht/);
  });
});

describe('Medien im Build', () => {
  it('Uploads werden vor dem Build nach src/assets/media gespiegelt; fehlende Dateien blockieren das Speichern', async () => {
    const up = await upload(srv.port, cookie, await testImage(), { filename: 'logo.jpg', alt: 'Logo' });
    const res = await editDraft(srv.port, cookie, (d) => {
      d.layout.header.logo = { media: up.json.id };
    });
    expect(res.status).toBe(200);
    expect((await cmsApi(srv.port, cookie, 'POST', '/publish', { revision: res.json.revision })).status).toBe(202);
    await srv.cms.builds.idle();
    expect(srv.builder.calls.at(-1).media).toContain('logo.jpg');
    expect(existsSync(path.join(srv.appDir, 'src', 'assets', 'media', 'logo.jpg'))).toBe(true);
    // Datei verschwindet vom Server → Validierung meldet es
    const { rm } = await import('node:fs/promises');
    await rm(path.join(srv.dataDir, 'media', 'logo.jpg'));
    const broken = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'x';
    });
    expect(broken.status).toBe(422);
    expect(broken.json.errors[0].message).toMatch(/Bilddatei fehlt/);
  });
});
