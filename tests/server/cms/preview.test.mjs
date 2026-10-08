/**
 * Vorschau-Modus: Cookie über /admin/vorschau, Auslieferung aus dem Vorschau-Build mit Leiste,
 * Editor-Modus ohne Leiste, ohne Session kein Zugriff.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bannerHtml, injectBanner } from '../../../server/lib/cms/preview.mjs';
import { AFTER_GO_LIVE, request } from '../helpers.mjs';
import { cmsApi, editDraft, loginAs, startCms } from './helpers.mjs';

let srv;
let cookie;
beforeEach(async () => {
  srv = await startCms();
  cookie = await loginAs(srv.port, 'rita');
});
afterEach(() => srv?.stop());

async function enablePreview(c = cookie, next = '/') {
  const res = await request(srv.port, { path: `/admin/vorschau?an=1&next=${encodeURIComponent(next)}`, headers: { Cookie: c } });
  expect(res.status).toBe(302);
  const set = [res.headers['set-cookie']].flat()[0];
  return { res, previewCookie: set.split(';')[0], set };
}

describe('/admin/vorschau', () => {
  it('ohne Session → Login mit Rücksprung', async () => {
    const res = await request(srv.port, { path: '/admin/vorschau?an=1&next=/karte' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?next=%2Fadmin%2Fvorschau%3Fan%3D1%26next%3D%2Fkarte');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('an=1 setzt das Cookie (HttpOnly, Lax) und leitet sicher weiter; aus=1 löscht es', async () => {
    const { res, set } = await enablePreview(cookie, '/karte?x=1');
    expect(res.headers.location).toBe('/karte?x=1');
    expect(set).toMatch(/^sus_preview=1; Path=\/; Max-Age=43200; HttpOnly; SameSite=Lax$/);
    const evil = await request(srv.port, { path: '/admin/vorschau?an=1&next=https://evil.example', headers: { Cookie: cookie } });
    expect(evil.headers.location).toBe('/');
    const off = await request(srv.port, { path: '/admin/vorschau?aus=1&next=/faq', headers: { Cookie: cookie } });
    expect(off.headers.location).toBe('/faq');
    expect([off.headers['set-cookie']].flat()[0]).toMatch(/^sus_preview=; Path=\/; Max-Age=0/);
    const secure = await request(srv.port, { host: 'sauerundsaftig.de', path: '/admin/vorschau?an=1', headers: { Cookie: await loginAs(srv.port, 'rita', { host: 'sauerundsaftig.de' }) } });
    expect([secure.headers['set-cookie']].flat()[0]).toMatch(/; Secure$/);
  });
});

describe('Auslieferung im Vorschau-Modus', () => {
  it('ohne Vorschau-Build: veröffentlichte Version mit Hinweis in der Leiste', async () => {
    const { previewCookie } = await enablePreview();
    const res = await request(srv.port, { path: '/', headers: { Cookie: `${cookie}; ${previewCookie}` } });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.text).toContain('Image-Build');
    expect(res.text).toMatch(/<body class="x"><div id="sus-preview-bar"/);
    expect(res.text).toContain('Noch keine Vorschau gebaut');
  });

  it('mit Vorschau-Build: Entwurf sichtbar (nur mit Cookie + Session), Live unverändert', async () => {
    const saved = await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Nur in der Vorschau';
    });
    expect((await cmsApi(srv.port, cookie, 'POST', '/preview', {})).status).toBe(202);
    await srv.cms.builds.idle();
    expect(srv.builder.calls.at(-1).kind).toBe('preview');
    const { previewCookie } = await enablePreview();
    const both = `${cookie}; ${previewCookie}`;

    const pv = await request(srv.port, { path: '/', headers: { Cookie: both } });
    expect(pv.text).toContain('Nur in der Vorschau');
    expect(pv.text).toContain('<p id="kind">preview</p>');
    expect(pv.text).toMatch(/Entwurf, Stand \d\d\.\d\d\. \d\d:\d\d Uhr/);
    expect(pv.text).toContain('href="/admin/vorschau?aus=1&amp;next=%2F"');
    expect(pv.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');

    const editor = await request(srv.port, { path: '/?__cms=editor', headers: { Cookie: both } });
    expect(editor.text).toContain('Nur in der Vorschau');
    expect(editor.text).not.toContain('sus-preview-bar');

    const asset = await request(srv.port, { path: `/_astro/app-${saved.json.revision}.css`, headers: { Cookie: both } });
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    // Fallback: was die Vorschau nicht hat, kommt aus dem Live-Build
    expect((await request(srv.port, { path: '/_astro/app.css', headers: { Cookie: both } })).status).toBe(200);

    const live = await request(srv.port, { path: '/', headers: { Cookie: cookie } });
    expect(live.text).toContain('Image-Build');
    expect(live.text).not.toContain('sus-preview-bar');

    // Vorschau-Cookie ohne Session → normale (öffentliche) Seite
    srv.clock.set(AFTER_GO_LIVE);
    const anon = await request(srv.port, { host: 'sauerundsaftig.de', path: '/', headers: { Cookie: previewCookie } });
    expect(anon.status).toBe(200);
    expect(anon.text).toContain('Image-Build');
    expect(anon.text).not.toContain('sus-preview-bar');
    expect(anon.headers['cache-control']).toBe('no-cache');
  });

  it('Entwurf neuer als Vorschau → Hinweis; 404 kommt aus dem Vorschau-Build', async () => {
    await cmsApi(srv.port, cookie, 'POST', '/preview', {});
    await srv.cms.builds.idle();
    await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'neuer';
    });
    const { previewCookie } = await enablePreview();
    const res = await request(srv.port, { path: '/gibtsnicht', headers: { Cookie: `${cookie}; ${previewCookie}` } });
    expect(res.status).toBe(404);
    expect(res.text).toContain('der Entwurf ist neuer');
  });
});

describe('Leiste', () => {
  it('escaped, nach <body>, Vorschau-Parameter entfernt', () => {
    const b = bannerHtml({ path: '/a"b', search: '?__cms=editor&x=1', previewBuild: null, draftRevision: 1, building: false });
    expect(b).toContain('next=%2Fa%22b%3Fx%3D1');
    expect(injectBanner('<html><body data-x="1"><p>x</p></body></html>', '<i>B</i>')).toBe('<html><body data-x="1"><i>B</i><p>x</p></body></html>');
    expect(injectBanner('<p>ohne body</p>', '<i>B</i>')).toBe('<i>B</i><p>ohne body</p>');
  });
});
