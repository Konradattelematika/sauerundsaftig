/**
 * Test-Helfer für das CMS: temporäres App-Verzeichnis und Image-dist, Fake-Builder, Server mit
 * verstellbarer Uhr, Benutzer aller Rollen, API-Aufrufe.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '../../../server/lib/auth.mjs';
import { loadConfig } from '../../../server/lib/config.mjs';
import { startServer } from '../../../server/lib/app.mjs';
import { BEFORE_GO_LIVE, PASSWORDS, SEED, login, request, silentLog } from '../helpers.mjs';

export const CMS_PASSWORDS = { ...PASSWORDS, rita: 'redaktion-mit-krume-5' };

export async function cmsUsers() {
  return [
    { id: 'konrad', name: 'Konrad', role: 'team', hash: await hashPassword(CMS_PASSWORDS.konrad, { N: 1024 }) },
    { id: 'josie', name: 'Josie', role: 'inhaberin', hash: await hashPassword(CMS_PASSWORDS.josie, { N: 1024 }) },
    { id: 'rita', name: 'Rita', role: 'redaktion', hash: await hashPassword(CMS_PASSWORDS.rita, { N: 1024 }) },
  ];
}

const tmp = (prefix) => mkdtemp(path.join(os.tmpdir(), prefix));

/** Kleines Testbild (sharp) */
export function testImage({ width = 40, height = 20, format = 'jpeg', color = '#c0392b', orientation } = {}) {
  let img = sharp({ create: { width, height, channels: 3, background: color } });
  img = format === 'png' ? img.png() : format === 'webp' ? img.webp() : format === 'avif' ? img.avif({ effort: 0 }) : img.jpeg();
  if (orientation) img = img.withMetadata({ orientation, exif: { IFD0: { Copyright: 'Kamera-Metadaten' } } });
  return img.toBuffer();
}

/** App-Verzeichnis ohne Repo-Inhalte (Medien-Sync schreibt hierhin); ein Grundbestands-Foto für Vorschaubilder */
export async function makeAppDir() {
  const dir = await tmp('sus-cms-app-');
  await mkdir(path.join(dir, 'src', 'assets', 'photos'), { recursive: true });
  await mkdir(path.join(dir, 'src', 'assets', 'media'), { recursive: true });
  await writeFile(path.join(dir, 'src', 'assets', 'photos', 'brot-laib.jpg'), await testImage({ width: 800, height: 600, color: '#8a5a2b' }));
  return dir;
}

const html = (title, body) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title></head><body class="x"><main>${body}</main></body></html>`;

/** dist aus dem „Image" */
export async function makeImageDist() {
  const dir = await tmp('sus-cms-dist-');
  await mkdir(path.join(dir, 'admin'), { recursive: true });
  await mkdir(path.join(dir, '_astro'), { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html('Image', '<p id="claim">Image-Build</p>'));
  await writeFile(path.join(dir, 'admin', 'index.html'), html('Admin', '<div id="admin-app">Dashboard</div>'));
  await writeFile(path.join(dir, '404.html'), html('404', '<p>Nicht gefunden (Image)</p>'));
  await writeFile(path.join(dir, '_astro', 'app.css'), 'body{color:#222}');
  return dir;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fake-Builder: schreibt eine Mini-Site aus content.json (Claim, Revision, Art, je aktive Seite eine Datei).
 * @param {{ fail?: boolean|((args) => boolean), delayMs?: number }} [opts]
 */
export function fakeBuilder({ fail = false, delayMs = 0 } = {}) {
  const calls = [];
  const fn = async (args) => {
    const media = existsSync(path.join(args.appDir, 'src', 'assets', 'media')) ? readdirSync(path.join(args.appDir, 'src', 'assets', 'media')) : [];
    calls.push({ ...args, media });
    args.onLog('fake: baue …');
    if (delayMs) await sleep(delayMs);
    if (typeof fail === 'function' ? fail(args) : fail) {
      args.onLog('fake: Syntaxfehler in Zeile 3');
      throw new Error('Build fehlgeschlagen (Exit-Code 1) — Details im Protokoll');
    }
    const doc = JSON.parse(await readFile(args.contentFile, 'utf8'));
    const out = args.outDir;
    await mkdir(path.join(out, 'admin'), { recursive: true });
    await mkdir(path.join(out, '_astro'), { recursive: true });
    await writeFile(
      path.join(out, 'index.html'),
      html(doc.settings.name, `<p id="claim">${doc.settings.claim}</p><p id="rev">r${doc.meta.revision}</p><p id="kind">${args.kind}</p>`),
    );
    for (const p of doc.pages ?? []) {
      if (p.status !== 'published' || !p.slug || p.template) continue;
      await mkdir(path.join(out, p.slug), { recursive: true });
      const first = p.sections?.find((s) => s.type === 'text');
      await writeFile(path.join(out, p.slug, 'index.html'), html(p.seo?.title ?? p.title, `<h1>${first?.fields?.title ?? p.title}</h1>`));
    }
    await writeFile(path.join(out, 'admin', 'index.html'), html('Admin', `<div id="admin-app">Dashboard ${args.kind}</div>`));
    await writeFile(path.join(out, '404.html'), html('404', '<p>Nicht gefunden</p>'));
    await writeFile(path.join(out, '_astro', `app-${doc.meta.revision}.css`), 'body{color:#111}');
  };
  fn.calls = calls;
  return fn;
}

/**
 * CMS-Server starten. Wiederverwendbar für Neustarts: dataDir/appDir/distDir/usersJson mitgeben.
 */
export async function startCms({ env = {}, builder = fakeBuilder(), start = BEFORE_GO_LIVE, dataDir, appDir, distDir, usersJson, cmsOptions } = {}) {
  const data = dataDir ?? (await tmp('sus-cms-data-'));
  const app = appDir ?? (await makeAppDir());
  const dist = distDir ?? (await makeImageDist());
  const users = usersJson ?? JSON.stringify(await cmsUsers());
  const config = loadConfig({
    SUS_USERS: users,
    SUS_SESSION_SECRET: 'cms-test-secret-'.padEnd(48, 'x'),
    SUS_DIST_DIR: dist,
    SUS_DATA_DIR: data,
    SUS_APP_DIR: app,
    SUS_SEED_FILE: SEED,
    SUS_QUIET: '1',
    SUS_CODE_VERSION: 'test-1',
    ...env,
  });
  let current = new Date(start);
  const clock = {
    now: () => new Date(current),
    set: (d) => {
      current = new Date(d);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
  const srv = await startServer(config, { now: clock.now, log: silentLog, port: 0, host: '127.0.0.1', builder, cmsOptions });
  return {
    ...srv,
    config,
    clock,
    builder,
    dataDir: data,
    appDir: app,
    distDir: dist,
    usersJson: users,
    /** gleicher Datenbestand, neuer Prozess */
    restartOpts: (extra = {}) => ({ dataDir: data, appDir: app, distDir: dist, usersJson: users, builder, ...extra }),
    async stop({ keepData = false } = {}) {
      await srv.close();
      if (!keepData) {
        for (const d of [data, app, dist]) await rm(d, { recursive: true, force: true });
      }
    },
  };
}

let ipCounter = 1;
/** Anmelden → Cookie-Header-Wert */
export async function loginAs(port, user, { host = 'localhost' } = {}) {
  const { cookie, res } = await login(port, { user, password: CMS_PASSWORDS[user], host, ip: `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}` });
  if (res.status !== 303 || !cookie) throw new Error(`Login ${user} fehlgeschlagen (${res.status} ${res.headers.location})`);
  return cookie;
}

/** /api/cms/<pfad> aufrufen (JSON) */
export function cmsApi(port, cookie, method, p, body, { host = 'localhost', headers = {} } = {}) {
  const hasBody = body !== undefined;
  return request(port, {
    method,
    path: `/api/cms${p}`,
    host,
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: hasBody ? body : undefined,
  });
}

/** Aktuellen Entwurf holen → { doc, revision } */
export async function getDraft(port, cookie) {
  const res = await cmsApi(port, cookie, 'GET', '/state');
  if (res.status !== 200) throw new Error(`state ${res.status}`);
  const { meta, ...doc } = res.json.draft;
  return { doc, revision: meta.revision, state: res.json };
}

/** Entwurf ändern (mutate(doc)) und speichern → Antwort */
export async function editDraft(port, cookie, mutate) {
  const { doc, revision } = await getDraft(port, cookie);
  mutate(doc);
  return cmsApi(port, cookie, 'PUT', '/draft', { doc, baseRevision: revision });
}

/** Neue Seite mit Text-Abschnitt (für Slug-/Weiterleitungs-Tests) */
export function textPage(id, slug, title = 'Testseite') {
  return {
    id,
    slug,
    title,
    status: 'published',
    kind: 'custom',
    seo: { title: `${title} – Sauer & Saftig`, description: 'Eine Testseite.' },
    sections: [{ id: 'einleitung', type: 'text', visible: true, fields: { eyebrow: '', title: `${title} Überschrift`, intro: '', body: 'Hallo **Welt**.', background: 'bg' } }],
  };
}

/** Bild hochladen */
export function upload(port, cookie, buf, { type = 'image/jpeg', filename = 'foto.jpg', alt, replace, headers = {} } = {}) {
  return request(port, {
    method: 'POST',
    path: `/api/cms/media${replace ? `?replace=${encodeURIComponent(replace)}` : ''}`,
    headers: {
      'Content-Type': type,
      Cookie: cookie,
      'X-Filename': encodeURIComponent(filename),
      ...(alt !== undefined ? { 'X-Alt': encodeURIComponent(alt) } : {}),
      ...headers,
    },
    body: buf,
  });
}
