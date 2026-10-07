/** Datentypen & Validierung (docs/LIVE-PLAN.md §2.5). */
import { randomBytes } from 'node:crypto';
import { HttpError } from './http.mjs';

export const PHASES = ['vor', 'nach'];
export const OWNERS = ['team', 'josie', 'beide'];
export const STATUSES = ['offen', 'in_arbeit', 'erledigt', 'verworfen'];
export const PRIORITIES = ['blocker', 'wichtig', 'normal'];
export const COMMENT_KINDS = ['feedback', 'frage', 'antwort'];
export const RATINGS = ['nein', 'gut', 'super'];

export const LIMITS = { title: 200, description: 4000, text: 4000, comment: 4000, category: 60, assignee: 60, link: 500 };
export const DEFAULT_CATEGORY = 'allgemein';

/** IDs von Checklisten-Punkten/Kommentaren (Seed-IDs + generierte). */
export const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** itemId/optionId des Modul-Boards. */
export const MODULE_ID_RE = /^[a-z0-9-]{1,64}$/;

export function newId(prefix) {
  return `${prefix}-${randomBytes(6).toString('base64url')}`;
}

const bad = (msg) => new HttpError(400, msg);

/** Pflicht-String (getrimmt, nicht leer, Längenlimit). */
export function reqString(value, field, max) {
  if (typeof value !== 'string') throw bad(`${field} fehlt oder ist kein Text`);
  const v = value.trim();
  if (!v) throw bad(`${field} darf nicht leer sein`);
  if (v.length > max) throw bad(`${field} ist zu lang (max. ${max} Zeichen)`);
  return v;
}

/** Optionaler String: undefined → undefined, null/'' → '' */
export function optString(value, field, max) {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (typeof value !== 'string') throw bad(`${field} ist kein Text`);
  const v = value.trim();
  if (v.length > max) throw bad(`${field} ist zu lang (max. ${max} Zeichen)`);
  return v;
}

export function enumValue(value, field, allowed) {
  if (!allowed.includes(value)) throw bad(`${field} muss einer der Werte ${allowed.join(', ')} sein`);
  return value;
}

/** Link: http(s)-URL oder relativer Pfad; leer → '' (entfernen). */
export function linkValue(value) {
  const v = optString(value, 'link', LIMITS.link);
  if (v === undefined || v === '') return v;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch {
    /* unten */
  }
  throw bad('link muss mit https:// beginnen oder ein relativer Pfad sein');
}

/** Body muss ein JSON-Objekt sein. */
export function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('JSON-Objekt erwartet');
  return body;
}

/**
 * Felder eines Checklisten-Punkts validieren.
 * @param {object} body
 * @param {{ partial: boolean }} opts  partial=true für PATCH (nur gesetzte Felder)
 */
export function validateItemFields(body, { partial }) {
  const out = {};
  if (!partial || body.title !== undefined) out.title = reqString(body.title, 'title', LIMITS.title);
  if (body.description !== undefined) out.description = optString(body.description, 'description', LIMITS.description);
  if (!partial || body.phase !== undefined) out.phase = enumValue(body.phase, 'phase', PHASES);
  if (!partial || body.owner !== undefined) out.owner = enumValue(body.owner, 'owner', OWNERS);
  if (body.priority !== undefined) out.priority = enumValue(body.priority, 'priority', PRIORITIES);
  if (body.status !== undefined) out.status = enumValue(body.status, 'status', STATUSES);
  if (body.category !== undefined) {
    const c = optString(body.category, 'category', LIMITS.category);
    out.category = c || DEFAULT_CATEGORY;
  }
  if (body.assignee !== undefined) out.assignee = optString(body.assignee, 'assignee', LIMITS.assignee);
  if (body.link !== undefined) out.link = linkValue(body.link);
  return out;
}

/** Leere optionale Felder entfernen (assignee/link = '' → Feld weg). */
export function cleanOptional(item) {
  for (const k of ['assignee', 'link']) if (item[k] === '' || item[k] === null) delete item[k];
  return item;
}

/** Seed-Eintrag tolerant normalisieren → Item-Felder (ohne Zeitstempel) oder null. */
export function normalizeSeedItem(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !RECORD_ID_RE.test(raw.id)) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const item = {
    id: raw.id,
    title: str(raw.title, LIMITS.title),
    description: str(raw.description, LIMITS.description),
    phase: pick(raw.phase, PHASES, 'vor'),
    owner: pick(raw.owner, OWNERS, 'team'),
    status: pick(raw.status, STATUSES, 'offen'),
    priority: pick(raw.priority, PRIORITIES, 'normal'),
    category: str(raw.category, LIMITS.category) || DEFAULT_CATEGORY,
  };
  const assignee = str(raw.assignee, LIMITS.assignee);
  if (assignee) item.assignee = assignee;
  if (typeof raw.link === 'string') {
    try {
      const l = linkValue(raw.link);
      if (l) item.link = l;
    } catch {
      /* ungültiger Link im Seed → weglassen */
    }
  }
  return item;
}

export const SEED_FIELDS = ['title', 'description', 'phase', 'owner', 'status', 'priority', 'category', 'assignee', 'link'];

/**
 * Seed in den Checklisten-Zustand mergen (§2.6): fehlende Items ergänzen, vorhandene nur
 * aktualisieren, solange updatedBy === 'seed'. Reine Funktion.
 * @returns {{ state: { items: object[], comments: object[] }, added: string[], updated: string[] }}
 */
export function mergeSeed(state, seedItems, nowIso) {
  const items = state.items.map((i) => ({ ...i }));
  const index = new Map(items.map((item, i) => [item.id, i]));
  const added = [];
  const updated = [];
  const seen = new Set();
  for (const raw of seedItems) {
    const s = normalizeSeedItem(raw);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    const i = index.get(s.id);
    if (i === undefined) {
      items.push({ ...s, createdAt: nowIso, updatedAt: nowIso, updatedBy: 'seed' });
      index.set(s.id, items.length - 1);
      added.push(s.id);
      continue;
    }
    const cur = items[i];
    if (cur.updatedBy !== 'seed') continue;
    const changed = SEED_FIELDS.some((f) => (cur[f] ?? undefined) !== (s[f] ?? undefined));
    if (!changed) continue;
    const next = { id: s.id, ...s, createdAt: cur.createdAt ?? nowIso, updatedAt: nowIso, updatedBy: 'seed' };
    items[i] = next;
    updated.push(s.id);
  }
  return { state: { ...state, items }, added, updated };
}
