/**
 * JSON-API (docs/LIVE-PLAN.md §2.5). Nur auf Tool- und Vorschau-Hosts (Live-Host: nur /api/golive,
 * das app.mjs direkt beantwortet). Schreibende Aufrufe: Session, application/json, gleiche Herkunft.
 */
import { safeTokenEqual } from './auth.mjs';
import { buildExport, buildMarkdown } from './export.mjs';
import { HttpError, isSameOrigin, mediaType, readBody, sendJson } from './http.mjs';
import {
  COMMENT_KINDS,
  LIMITS,
  MODULE_ID_RE,
  RATINGS,
  RECORD_ID_RE,
  cleanOptional,
  enumValue,
  newId,
  optString,
  reqString,
  requireObject,
  validateItemFields,
} from './model.mjs';
import { isGoLive } from './host-policy.mjs';

export const BODY_LIMIT = 64 * 1024;

const notFound = () => new HttpError(404, 'Nicht gefunden');

function recordId(value) {
  if (typeof value !== 'string' || !RECORD_ID_RE.test(value)) throw notFound();
  return value;
}

function moduleId(value, field) {
  if (typeof value !== 'string' || !MODULE_ID_RE.test(value)) throw new HttpError(400, `${field} ist ungültig (erlaubt: a-z, 0-9, -)`);
  return value;
}

async function readJson(req) {
  if (mediaType(req) !== 'application/json') throw new HttpError(415, 'Content-Type application/json erwartet');
  const buf = await readBody(req, BODY_LIMIT);
  if (!buf.length) throw new HttpError(400, 'Leerer Body');
  try {
    return requireObject(JSON.parse(buf.toString('utf8')));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Ungültiges JSON');
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, role: user.role };
}

/* ------------------------------------------------------------------ Handler ------ */

function getChecklist({ store }) {
  return { items: store.checklist.items, comments: store.checklist.comments };
}

async function createItem({ req, store, user, now }) {
  const body = await readJson(req);
  const fields = validateItemFields(body, { partial: false });
  const ts = now().toISOString();
  return store.update('checklist', (draft) => {
    const item = cleanOptional({
      id: newId('p'),
      title: fields.title,
      description: fields.description ?? '',
      phase: fields.phase,
      owner: fields.owner,
      status: fields.status ?? 'offen',
      priority: fields.priority ?? 'normal',
      category: fields.category ?? 'allgemein',
      ...(fields.assignee ? { assignee: fields.assignee } : {}),
      ...(fields.link ? { link: fields.link } : {}),
      createdAt: ts,
      updatedAt: ts,
      updatedBy: user.id,
    });
    draft.items.push(item);
    return { result: item, event: { user: user.id, action: 'checklist.item.create', id: item.id, data: fields } };
  });
}

async function patchItem({ req, store, user, now }, id) {
  const body = await readJson(req);
  const fields = validateItemFields(body, { partial: true });
  if (!Object.keys(fields).length) throw new HttpError(400, 'Keine änderbaren Felder angegeben');
  return store.update('checklist', (draft) => {
    const item = draft.items.find((i) => i.id === id);
    if (!item) throw notFound();
    Object.assign(item, fields, { updatedAt: now().toISOString(), updatedBy: user.id });
    cleanOptional(item);
    return { result: item, event: { user: user.id, action: 'checklist.item.update', id, data: fields } };
  });
}

async function createComment({ req, store, user, now }, itemId) {
  const body = await readJson(req);
  const text = reqString(body.text, 'text', LIMITS.text);
  const kind = body.kind === undefined || body.kind === null ? 'feedback' : enumValue(body.kind, 'kind', COMMENT_KINDS);
  return store.update('checklist', (draft) => {
    if (!draft.items.some((i) => i.id === itemId)) throw notFound();
    const comment = {
      id: newId('k'),
      itemId,
      userId: user.id,
      userName: user.name,
      role: user.role,
      text,
      kind,
      resolved: false,
      createdAt: now().toISOString(),
    };
    draft.comments.push(comment);
    return { result: comment, event: { user: user.id, action: 'checklist.comment.create', id: comment.id, itemId, data: { kind, text } } };
  });
}

async function patchComment({ req, store, user }, id) {
  const body = await readJson(req);
  if (typeof body.resolved !== 'boolean') throw new HttpError(400, 'resolved muss true oder false sein');
  return store.update('checklist', (draft) => {
    const comment = draft.comments.find((c) => c.id === id);
    if (!comment) throw notFound();
    comment.resolved = body.resolved;
    return { result: comment, event: { user: user.id, action: 'checklist.comment.resolve', id, data: { resolved: body.resolved } } };
  });
}

function getModuleState({ store }) {
  return { votes: store.module.votes, choices: store.module.choices };
}

async function putVote({ req, store, user, now }) {
  const body = await readJson(req);
  const itemId = moduleId(body.itemId, 'itemId');
  const optionId = moduleId(body.optionId, 'optionId');
  const rating = body.rating === undefined || body.rating === null ? null : enumValue(body.rating, 'rating', RATINGS);
  const comment = optString(body.comment, 'comment', LIMITS.comment) ?? '';
  return store.update('module', (draft) => {
    let vote = draft.votes.find((v) => v.userId === user.id && v.itemId === itemId && v.optionId === optionId);
    const ts = now().toISOString();
    if (!vote) {
      vote = { itemId, optionId, userId: user.id, userName: user.name, rating, comment, updatedAt: ts };
      draft.votes.push(vote);
    } else {
      Object.assign(vote, { userName: user.name, rating, comment, updatedAt: ts });
    }
    return { result: vote, event: { user: user.id, action: 'module.vote', itemId, optionId, data: { rating, comment } } };
  });
}

/** Entscheidung: eine aktive Option je Element (unabhängig vom Benutzer; userId = wer entschieden hat). */
async function putChoice({ req, store, user, now }) {
  const body = await readJson(req);
  const itemId = moduleId(body.itemId, 'itemId');
  if (!('optionId' in body)) throw new HttpError(400, 'optionId fehlt (null zum Entfernen)');
  const optionId = body.optionId === null ? null : moduleId(body.optionId, 'optionId');
  return store.update('module', (draft) => {
    const idx = draft.choices.findIndex((c) => c.itemId === itemId);
    if (optionId === null) {
      if (idx >= 0) draft.choices.splice(idx, 1);
      return { result: { removed: true }, event: { user: user.id, action: 'module.choice.remove', itemId } };
    }
    const choice = { itemId, optionId, userId: user.id, userName: user.name, updatedAt: now().toISOString() };
    if (idx >= 0) draft.choices[idx] = choice;
    else draft.choices.push(choice);
    return { result: choice, event: { user: user.id, action: 'module.choice.set', itemId, optionId } };
  });
}

/* ------------------------------------------------------------------ Router ------- */

/**
 * Routen: [Pfadmuster, Methode, Handler, { write?, exportAuth? }]
 * ':id' matcht ein beliebiges Segment, das an den Handler übergeben wird.
 */
const ROUTES = [
  [['me'], 'GET', ({ user }) => ({ user: publicUser(user) })],
  [['checklist'], 'GET', getChecklist],
  [['checklist', 'items'], 'POST', createItem, { write: true, status: 201 }],
  [['checklist', 'items', ':id'], 'PATCH', patchItem, { write: true }],
  [['checklist', 'items', ':id', 'comments'], 'POST', createComment, { write: true, status: 201 }],
  [['checklist', 'comments', ':id'], 'PATCH', patchComment, { write: true }],
  [['module', 'state'], 'GET', getModuleState],
  [['module', 'votes'], 'PUT', putVote, { write: true }],
  [['module', 'choices'], 'PUT', putChoice, { write: true }],
  [['export'], 'GET', null, { exportAuth: true, kind: 'json' }],
  [['export.md'], 'GET', null, { exportAuth: true, kind: 'md' }],
];

function matchRoute(segments) {
  const matches = [];
  for (const [pattern, method, handler, opts = {}] of ROUTES) {
    if (pattern.length !== segments.length) continue;
    const params = [];
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === ':id') params.push(segments[i]);
      else if (pattern[i] !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push({ method, handler, opts, params });
  }
  return matches;
}

/**
 * @param {object} ctx  { req, res, apiSegments, user, store, config, now, writeLimiter }
 */
export async function handleApi(ctx) {
  const { req, res, apiSegments, config, now } = ctx;
  try {
    const matches = matchRoute(apiSegments);
    if (!matches.length) throw notFound();
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const route = matches.find((m) => m.method === method);
    if (!route) {
      throw new HttpError(405, 'Methode nicht erlaubt', { Allow: [...new Set(matches.map((m) => m.method))].join(', ') });
    }
    const { opts } = route;

    if (opts.exportAuth) {
      const auth = req.headers.authorization ?? '';
      const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
      const tokenOk = Boolean(config.exportToken) && bearer !== undefined && safeTokenEqual(bearer, config.exportToken);
      if (!ctx.user && !tokenOk) throw new HttpError(401, 'Nicht angemeldet');
      const nowDate = now();
      const meta = { now: nowDate, goLiveAt: config.goLiveAt, live: isGoLive(config, nowDate) };
      const data = { checklist: ctx.store.checklist, module: ctx.store.module };
      if (opts.kind === 'md') {
        const body = Buffer.from(buildMarkdown(data, meta), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
          'Content-Disposition': 'inline; filename="sauerundsaftig-export.md"',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      sendJson(res, 200, buildExport(data, meta));
      return;
    }

    if (!ctx.user) throw new HttpError(401, 'Nicht angemeldet');

    if (opts.write) {
      if (!isSameOrigin(req)) throw new HttpError(403, 'Anfrage von fremder Herkunft abgelehnt');
      if (ctx.writeLimiter) {
        if (ctx.writeLimiter.isBlocked(ctx.user.id)) throw new HttpError(429, 'Zu viele Änderungen — bitte kurz warten');
        ctx.writeLimiter.hit(ctx.user.id);
      }
    }

    const params = route.params.map(recordId);
    const result = await route.handler(ctx, ...params);
    sendJson(res, opts.status ?? 200, result);
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message }, err.headers);
      return;
    }
    throw err;
  }
}
