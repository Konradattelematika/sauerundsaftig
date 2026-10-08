/**
 * CMS-API /api/cms/* (docs/CMS-PLAN.md §7.3) — auf allen Hosts, immer mit Session.
 * Schreibend: gleiche Herkunft + application/json (Medien-Upload: image/*), Rate-Limit wie /api.
 * Fehler: { error, …details } mit 400/401/403/404/409/413/415/422/429/503.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createSessionToken, sessionCookie } from '../auth.mjs';
import { HttpError, isSameOrigin, mediaType, readBody, sendJson } from '../http.mjs';
import { etagMatches } from '../static.mjs';
import { ID_RE, mediaUsages } from '../../../src/cms/validate.mjs';
import { MEDIA_MAX_BYTES, MediaFiles, THUMB_WIDTHS, normalizeImage, slugifyName, sniffImage, uniqueId } from './media.mjs';
import { USER_ID_RE, can, effectiveRole, permissionsFor } from './users.mjs';

export const DRAFT_BODY_LIMIT = 6 * 1024 * 1024;
const SMALL_BODY_LIMIT = 64 * 1024;
const VERSION_ID_RE = /^\d{8}T\d{9}Z-r\d+$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

async function readJson(req, limit = SMALL_BODY_LIMIT, { optional = false } = {}) {
  if (mediaType(req) !== 'application/json') throw new HttpError(415, 'Content-Type application/json erwartet');
  const buf = await readBody(req, limit);
  if (!buf.length) {
    if (optional) return {};
    throw new HttpError(400, 'Leerer Body');
  }
  let data;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Ungültiges JSON');
  }
  if (!isObj(data)) throw new HttpError(400, 'JSON-Objekt erwartet');
  return data;
}

function decodeHeader(value, max) {
  if (typeof value !== 'string' || !value) return '';
  let out;
  try {
    out = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Kopfzeile ist nicht korrekt URL-kodiert');
  }
  out = out.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if ([...out].length > max) throw new HttpError(422, `Text ist zu lang (höchstens ${max} Zeichen).`);
  return out;
}

/**
 * @param {object} cms  aus createCms(): store, users, media, builds, defs, validate, gcMedia, codeVersion, config, now
 */
export function createCmsApi(cms) {
  const { store, users, media, builds, defs, config } = cms;

  const me = (user) => ({ id: user.id, name: user.name, role: effectiveRole(user.role), permissions: permissionsFor(user.role) });
  let normalizeQueue = Promise.resolve();

  async function validator(mode) {
    const mediaFiles = await media.list();
    return (doc) => cms.validateOrThrow(doc, mode, mediaFiles);
  }

  /* ---------------------------------------------------------------- Inhalte ----- */

  async function getState({ user }) {
    const mediaFiles = await media.list();
    const issues = cms.validate(store.draft, 'publish', mediaFiles);
    const status = builds.status();
    return {
      draft: store.publicDraft(),
      draftMeta: store.draftMeta(),
      publishedMeta: store.publishedMeta(),
      dirty: store.isDirty(),
      live: status.live,
      preview: status.preview,
      online: builds.online(),
      previewOnline: builds.previewOnline(),
      issues,
      me: me(user),
      codeVersion: cms.codeVersion,
      readOnly: store.readOnly,
    };
  }

  async function putDraft({ req, user }) {
    const body = await readJson(req, DRAFT_BODY_LIMIT);
    if (!isObj(body.doc)) throw new HttpError(400, 'doc fehlt');
    return store.saveDraft({ doc: body.doc, baseRevision: body.baseRevision, user, validate: await validator('draft') });
  }

  async function discardDraft({ req, user }) {
    await readJson(req, SMALL_BODY_LIMIT, { optional: true });
    const result = await store.discard(user);
    await cms.gcMedia();
    return result;
  }

  async function validateDoc({ req }) {
    const body = await readJson(req, DRAFT_BODY_LIMIT);
    if (!isObj(body.doc)) throw new HttpError(400, 'doc fehlt');
    return cms.validate(body.doc, body.mode === 'draft' ? 'draft' : 'publish', await media.list());
  }

  async function requestPreview({ req, user }) {
    await readJson(req, SMALL_BODY_LIMIT, { optional: true });
    return { build: builds.request('preview', { user: user.id, reason: 'preview' }) };
  }

  async function publish({ req, user }) {
    const body = await readJson(req);
    const result = await store.publish({ revision: body.revision, user, validate: await validator('publish') });
    await cms.gcMedia();
    const build = builds.request('live', { user: user.id, reason: 'publish' });
    return { build, revision: result.revision, draftRevision: result.draftRevision, changed: result.changed, redirects: result.redirects, version: result.version };
  }

  function getBuild() {
    return { ...builds.status(), online: builds.online(), previewOnline: builds.previewOnline() };
  }

  function listVersions() {
    return store.listVersions();
  }

  async function restoreVersion({ req, user }, id) {
    await readJson(req, SMALL_BODY_LIMIT, { optional: true });
    if (!VERSION_ID_RE.test(id)) throw new HttpError(404, 'Version nicht gefunden.');
    const result = await store.restore(id, user, await validator('draft'));
    await cms.gcMedia();
    return result;
  }

  /* ---------------------------------------------------------------- Medien ------ */

  async function uploadMedia({ req, res, user, search }) {
    if (!mediaType(req).startsWith('image/')) throw new HttpError(415, 'Bitte ein Bild hochladen (JPEG, PNG, WebP oder AVIF).');
    const replace = new URLSearchParams(search).get('replace');
    if (replace !== null && !ID_RE.test(replace)) throw new HttpError(404, 'Bild nicht gefunden.');
    if (replace !== null && !store.draft.media.some((m) => m.id === replace)) throw new HttpError(404, 'Bild nicht gefunden.');
    const filename = decodeHeader(req.headers['x-filename'], 200);
    const alt = decodeHeader(req.headers['x-alt'], 300);
    const buf = await readBody(req, MEDIA_MAX_BYTES);
    if (!buf.length) throw new HttpError(400, 'Leere Datei');
    const kind = sniffImage(buf);
    if (!kind) throw new HttpError(415, 'Nur JPEG, PNG, WebP oder AVIF sind erlaubt.');
    // nacheinander normalisieren (RAM: ein großes Foto dekodiert schnell auf > 100 MB)
    const run = normalizeQueue.then(() => normalizeImage(buf, kind, cms.appDir));
    normalizeQueue = run.catch(() => {});
    const norm = await run;
    const baseId = replace ?? uniqueId(slugifyName(filename), new Set(store.draft.media.map((m) => m.id)));
    const file = await media.store(baseId, norm);
    const ts = cms.now().toISOString();
    const { result, revision } = await store.updateDraft(user, (doc) => {
      if (replace !== null) {
        const item = doc.media.find((m) => m.id === replace);
        if (!item) throw new HttpError(404, 'Bild nicht gefunden.');
        const set = { ...(item.kind === 'upload' ? { file } : { replacedBy: file }), width: norm.width, height: norm.height, ...(alt ? { alt } : {}) };
        Object.assign(item, set);
        return { op: { type: 'media.update', id: replace, set }, result: item, event: { action: 'cms.media.replace', id: replace, file } };
      }
      const id = uniqueId(baseId, new Set(doc.media.map((m) => m.id)));
      const item = { id, kind: 'upload', file, alt, width: norm.width, height: norm.height, createdAt: ts, createdBy: user.id };
      doc.media.push(item);
      return { op: { type: 'media.add', item }, result: item, event: { action: 'cms.media.upload', id, file, bytes: norm.data.length } };
    });
    res.setHeader('X-CMS-Revision', String(revision));
    return { body: result, status: replace !== null ? 200 : 201 };
  }

  async function mediaFile({ req, res, search }, id) {
    if (!ID_RE.test(id)) throw new HttpError(404, 'Bild nicht gefunden.');
    const item = store.draft.media.find((m) => m.id === id) ?? store.published.media.find((m) => m.id === id);
    const src = media.sourcePath(item);
    const st = src ? await stat(src).catch(() => null) : null;
    if (!st?.isFile()) throw new HttpError(404, 'Bild nicht gefunden.');
    const wRaw = new URLSearchParams(search).get('w');
    let file = src;
    let type = MediaFiles.mimeFor(src);
    let etag = `"o-${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    if (wRaw !== null) {
      const w = Number.parseInt(wRaw, 10);
      if (!Number.isFinite(w) || w < 1) throw new HttpError(400, 'w muss eine Zahl sein');
      const width = THUMB_WIDTHS.find((x) => x >= w) ?? THUMB_WIDTHS.at(-1);
      ({ file, type, etag } = await media.thumbnail(src, width));
    }
    const headers = { 'Content-Type': type, 'Cache-Control': 'private, no-cache', ETag: etag };
    if (etagMatches(req.headers['if-none-match'], etag)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const size = (await stat(file)).size;
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    await new Promise((resolve) => {
      const stream = createReadStream(file);
      stream.on('error', () => {
        res.destroy();
        resolve();
      });
      res.on('close', resolve);
      stream.pipe(res);
    });
  }

  async function deleteMedia({ user }, id) {
    if (!ID_RE.test(id)) throw new HttpError(404, 'Bild nicht gefunden.');
    const { result } = await store.updateDraft(user, (doc) => {
      const item = doc.media.find((m) => m.id === id);
      if (!item) throw new HttpError(404, 'Bild nicht gefunden.');
      const usages = mediaUsages(doc, id, defs);
      // Grundbestand ist nie löschbar (nur ersetzbar) — Verwendungsnachweis trotzdem mitgeben
      if (item.kind !== 'upload') {
        const err = new HttpError(409, 'Bilder aus dem Grundbestand lassen sich nicht löschen, nur ersetzen.');
        err.body = { usages };
        throw err;
      }
      if (usages.length) {
        const err = new HttpError(409, `Das Bild wird noch verwendet (${usages.length}×) — bitte zuerst dort austauschen.`);
        err.body = { usages };
        throw err;
      }
      doc.media = doc.media.filter((m) => m.id !== id);
      return { op: { type: 'media.delete', id }, result: { deleted: id }, event: { action: 'cms.media.delete', id } };
    });
    await cms.gcMedia();
    return result;
  }

  /* ---------------------------------------------------------------- Benutzer ---- */

  async function createUser({ req, user }) {
    return users.create(await readJson(req), user);
  }

  async function patchUser({ req, res, user, host }, id) {
    if (!USER_ID_RE.test(id)) throw new HttpError(404, 'Benutzer nicht gefunden.');
    const body = await readJson(req);
    const result = await users.update(id, body, user);
    if (id === user.id && body.password !== undefined) {
      // eigenes Passwort geändert → alte Sessions ungültig, diese bekommt ein neues Cookie
      const account = config.users.find((u) => u.id === id);
      if (account) res.setHeader('Set-Cookie', sessionCookie(createSessionToken(account, config, cms.now().getTime()), host, config));
    }
    return result;
  }

  async function deleteUser({ user }, id) {
    if (!USER_ID_RE.test(id)) throw new HttpError(404, 'Benutzer nicht gefunden.');
    return users.remove(id, user);
  }

  /* ---------------------------------------------------------------- Router ------ */

  // [Pfad, Methode, Handler, { perm, write, status, raw }]  ':id' = beliebiges Segment
  const ROUTES = [
    [['state'], 'GET', getState, { perm: 'cms.view' }],
    [['draft'], 'PUT', putDraft, { perm: 'cms.edit', write: true }],
    [['draft', 'discard'], 'POST', discardDraft, { perm: 'cms.edit', write: true }],
    [['validate'], 'POST', validateDoc, { perm: 'cms.view', write: true }],
    [['preview'], 'POST', requestPreview, { perm: 'cms.view', write: true, status: 202 }],
    [['publish'], 'POST', publish, { perm: 'cms.publish', write: true, status: 202 }],
    [['build'], 'GET', getBuild, { perm: 'cms.view' }],
    [['versions'], 'GET', listVersions, { perm: 'cms.view' }],
    [['versions', ':id', 'restore'], 'POST', restoreVersion, { perm: 'cms.edit', write: true }],
    [['media'], 'POST', uploadMedia, { perm: 'media.manage', write: true, upload: true }],
    [['media', ':id', 'file'], 'GET', mediaFile, { perm: 'cms.view', raw: true }],
    [['media', ':id'], 'DELETE', deleteMedia, { perm: 'media.manage', write: true }],
    [['users'], 'GET', () => users.list(), { perm: 'users.manage' }],
    [['users'], 'POST', createUser, { perm: 'users.manage', write: true, status: 201 }],
    [['users', ':id'], 'PATCH', patchUser, { perm: 'users.manage', write: true }],
    [['users', ':id'], 'DELETE', deleteUser, { perm: 'users.manage', write: true }],
  ];

  function match(segments) {
    const out = [];
    for (const [pattern, method, handler, opts] of ROUTES) {
      if (pattern.length !== segments.length) continue;
      const params = [];
      if (pattern.every((p, i) => (p === ':id' ? (params.push(segments[i]), true) : p === segments[i]))) out.push({ method, handler, opts, params });
    }
    return out;
  }

  /**
   * @param {{ req, res, segments: string[], user: object|null, host: string, search: string, writeLimiter?: object }} ctx
   */
  return async function handleCmsApi(ctx) {
    const { req, res } = ctx;
    try {
      const matches = match(ctx.segments);
      if (!matches.length) throw new HttpError(404, 'Nicht gefunden');
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      const route = matches.find((m) => m.method === method);
      if (!route) throw new HttpError(405, 'Methode nicht erlaubt', { Allow: [...new Set(matches.map((m) => m.method))].join(', ') });
      const { opts } = route;
      if (!ctx.user) throw new HttpError(401, 'Nicht angemeldet');
      if (!can(ctx.user, opts.perm)) {
        const err = new HttpError(403, 'Für diese Aktion fehlt dir die Berechtigung.');
        err.body = { permission: opts.perm };
        throw err;
      }
      if (opts.write) {
        if (!isSameOrigin(req)) throw new HttpError(403, 'Anfrage von fremder Herkunft abgelehnt');
        if (ctx.writeLimiter) {
          if (ctx.writeLimiter.isBlocked(ctx.user.id)) throw new HttpError(429, 'Zu viele Änderungen — bitte kurz warten');
          ctx.writeLimiter.hit(ctx.user.id);
        }
      }
      const result = await route.handler(ctx, ...route.params);
      if (opts.raw) return;
      if (opts.upload) {
        sendJson(res, result.status, result.body);
        return;
      }
      sendJson(res, opts.status ?? 200, result);
    } catch (err) {
      if (err instanceof HttpError) {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        sendJson(res, err.status, { error: err.message, ...(err.body ?? {}) }, err.headers);
        return;
      }
      throw err;
    }
  };
}
