/**
 * Rollen, Rechte und Benutzerverwaltung (docs/CMS-PLAN.md §7.2).
 *
 * Rollen: admin (alles) · redaktion (alles außer Benutzerverwaltung). Altrollen team/inhaberin = admin.
 * Benutzer aus SUS_USERS (Env) bleiben Bootstrap: im Dashboard sichtbar, Passwort zurücksetzbar
 * (→ passwords.json wie bei /passwort), Name/Rolle/Löschen nur über die Server-Konfiguration.
 * Im Dashboard angelegte Benutzer liegen in <dataDir>/users.json (scrypt-Hash, nie Klartext).
 *
 * Die wirksame Benutzerliste (Env + Datei) wird in config.users gespiegelt — Login, Session-Prüfung
 * und /passwort arbeiten unverändert darauf. Passwortwechsel ändert den Hash → alte Sessions ungültig.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from '../auth.mjs';
import { HttpError } from '../http.mjs';
import { writeFileAtomic } from '../store.mjs';

export const PERMISSIONS = ['cms.view', 'cms.edit', 'cms.publish', 'media.manage', 'users.manage'];
export const CMS_ROLES = ['admin', 'redaktion'];
const ROLE_MAP = { admin: 'admin', team: 'admin', inhaberin: 'admin', redaktion: 'redaktion' };
const ROLE_PERMISSIONS = {
  admin: PERMISSIONS,
  redaktion: PERMISSIONS.filter((p) => p !== 'users.manage'),
};
export const ROLE_LABELS = { admin: 'Admin', redaktion: 'Redaktion' };
export const USER_ID_RE = /^[a-z0-9_-]{1,32}$/;
export const PASSWORD_MIN_LENGTH = 10;

/** Rolle (auch Altrolle) → 'admin' | 'redaktion' | null */
export function effectiveRole(role) {
  return Object.hasOwn(ROLE_MAP, role) ? ROLE_MAP[role] : null;
}

export function permissionsFor(role) {
  const r = effectiveRole(role);
  return r ? [...ROLE_PERMISSIONS[r]] : [];
}

export function can(user, permission) {
  return Boolean(user) && permissionsFor(user.role).includes(permission);
}

/** Passwort-Regeln wie /passwort → Fehlermeldung oder null */
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || [...pw.normalize('NFC')].length < PASSWORD_MIN_LENGTH) {
    return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`;
  }
  if (pw.length > 1024) return 'Das Passwort ist zu lang.';
  return null;
}

const bad = (msg) => new HttpError(422, msg);

function cleanName(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw bad('Bitte einen Namen angeben.');
  const name = value.trim().replace(/\s+/g, ' ');
  if ([...name].length > 60) throw bad('Der Name ist zu lang (höchstens 60 Zeichen).');
  return name;
}

function cleanRole(value, fallback) {
  if (value === undefined) return fallback;
  if (!CMS_ROLES.includes(value)) throw bad('Rolle muss „admin“ oder „redaktion“ sein.');
  return value;
}

export class UserStore {
  /**
   * @param {{ dataDir: string, envUsers: object[], target: object[], passwords?: { set(id: string, hash: string): Promise<void> },
   *           now?: () => Date, log?: Console, audit?: (event: object) => Promise<void>, hash?: (pw: string) => Promise<string> }} opts
   *   envUsers: Benutzer aus SUS_USERS (Objekte werden von PasswordOverrides mutiert) · target: config.users (wird gespiegelt)
   */
  constructor({ dataDir, envUsers, target, passwords, now = () => new Date(), log = console, audit, hash = hashPassword }) {
    this.file = path.join(dataDir, 'users.json');
    this.envUsers = envUsers;
    this.target = target;
    this.passwords = passwords;
    this.now = now;
    this.log = log;
    this.audit = audit ?? (async () => {});
    this.hash = hash;
    this.fileUsers = [];
    this.queue = Promise.resolve();
  }

  async init() {
    let raw = null;
    try {
      raw = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err?.code !== 'ENOENT') this.log.error(`[users] ${this.file} unlesbar — nur Env-Benutzer aktiv: ${err?.message ?? err}`);
    }
    const envIds = new Set(this.envUsers.map((u) => u.id));
    const seen = new Set();
    this.fileUsers = [];
    for (const u of Array.isArray(raw?.users) ? raw.users : []) {
      if (!u || !USER_ID_RE.test(u.id ?? '') || typeof u.hash !== 'string' || !u.hash.startsWith('scrypt$') || !CMS_ROLES.includes(u.role)) {
        this.log.warn(`[users] ungültiger Eintrag in users.json ignoriert (${JSON.stringify(u?.id ?? null)})`);
        continue;
      }
      if (envIds.has(u.id) || seen.has(u.id)) {
        this.log.warn(`[users] „${u.id}" gibt es schon (Env oder doppelt) — Eintrag aus users.json ignoriert.`);
        continue;
      }
      seen.add(u.id);
      this.fileUsers.push({ ...u, name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : u.id });
    }
    this.refresh();
    return this;
  }

  /** config.users = Env-Benutzer + Dashboard-Benutzer (dieselben Objekte → Hash-Änderungen wirken sofort) */
  refresh() {
    this.target.splice(0, this.target.length, ...this.envUsers, ...this.fileUsers);
  }

  #source(id) {
    if (this.envUsers.some((u) => u.id === id)) return 'env';
    if (this.fileUsers.some((u) => u.id === id)) return 'dashboard';
    return null;
  }

  #public(u, source) {
    return {
      id: u.id,
      name: u.name,
      role: effectiveRole(u.role),
      source,
      editable: source === 'dashboard',
      createdAt: u.createdAt,
      createdBy: u.createdBy,
      updatedAt: u.updatedAt,
      updatedBy: u.updatedBy,
    };
  }

  list() {
    return [...this.envUsers.map((u) => this.#public(u, 'env')), ...this.fileUsers.map((u) => this.#public(u, 'dashboard'))];
  }

  #adminCount(users) {
    return users.filter((u) => effectiveRole(u.role) === 'admin').length;
  }

  #serial(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async #write(next) {
    await writeFileAtomic(this.file, JSON.stringify({ users: next }, null, 2));
    this.fileUsers = next;
    this.refresh();
  }

  /** Neuen Benutzer anlegen (users.manage) */
  async create(input, actor) {
    const id = typeof input?.id === 'string' ? input.id.trim().toLowerCase() : '';
    if (!USER_ID_RE.test(id)) throw bad('Benutzername: 1–32 Zeichen, nur a–z, 0–9, _ und -.');
    const name = cleanName(input.name, id);
    const role = cleanRole(input.role ?? 'redaktion');
    const problem = passwordProblem(input.password);
    if (problem) throw bad(problem);
    const hash = await this.hash(input.password);
    return this.#serial(async () => {
      if (this.#source(id)) throw new HttpError(409, `Den Benutzer „${id}" gibt es schon.`);
      const ts = this.now().toISOString();
      const user = { id, name, role, hash, createdAt: ts, createdBy: actor.id, updatedAt: ts, updatedBy: actor.id };
      await this.#write([...this.fileUsers, user]);
      await this.audit({ user: actor.id, action: 'users.create', id, role });
      return this.#public(user, 'dashboard');
    });
  }

  /** Name/Rolle/Passwort ändern. Env-Benutzer: nur Passwort. */
  async update(id, patch, actor) {
    if (patch === null || typeof patch !== 'object') throw bad('Keine Änderungen angegeben.');
    const keys = Object.keys(patch).filter((k) => ['name', 'role', 'password'].includes(k));
    if (!keys.length) throw bad('Keine änderbaren Felder angegeben (name, role, password).');
    let hash;
    if (patch.password !== undefined) {
      const problem = passwordProblem(patch.password);
      if (problem) throw bad(problem);
      hash = await this.hash(patch.password);
    }
    return this.#serial(async () => {
      const source = this.#source(id);
      if (!source) throw new HttpError(404, 'Benutzer nicht gefunden.');
      if (source === 'env') {
        if (patch.name !== undefined || patch.role !== undefined) {
          throw new HttpError(409, 'Name und Rolle dieses Benutzers stehen in der Server-Konfiguration (SUS_USERS) und lassen sich nur dort ändern.');
        }
        if (!this.passwords) throw new HttpError(503, 'Passwortänderung ist gerade nicht möglich.');
        await this.passwords.set(id, hash);
        await this.audit({ user: actor.id, action: 'users.password', id });
        return this.#public(this.envUsers.find((u) => u.id === id), 'env');
      }
      const current = this.fileUsers.find((u) => u.id === id);
      const updated = {
        ...current,
        name: cleanName(patch.name, current.name),
        role: cleanRole(patch.role, current.role),
        ...(hash ? { hash } : {}),
        updatedAt: this.now().toISOString(),
        updatedBy: actor.id,
      };
      const next = this.fileUsers.map((u) => (u.id === id ? updated : u));
      if (this.#adminCount([...this.envUsers, ...next]) === 0) {
        throw new HttpError(409, 'Es muss mindestens ein Admin bleiben — bitte zuerst einen anderen Admin anlegen.');
      }
      await this.#write(next);
      await this.audit({
        user: actor.id,
        action: 'users.update',
        id,
        data: { ...(patch.name !== undefined ? { name: updated.name } : {}), ...(patch.role !== undefined ? { role: updated.role } : {}), ...(hash ? { password: true } : {}) },
      });
      return this.#public(updated, 'dashboard');
    });
  }

  async remove(id, actor) {
    return this.#serial(async () => {
      const source = this.#source(id);
      if (!source) throw new HttpError(404, 'Benutzer nicht gefunden.');
      if (source === 'env') throw new HttpError(409, 'Dieser Benutzer steht in der Server-Konfiguration (SUS_USERS) und lässt sich nur dort entfernen.');
      if (id === actor.id) throw new HttpError(409, 'Du kannst dich nicht selbst löschen.');
      const next = this.fileUsers.filter((u) => u.id !== id);
      if (this.#adminCount([...this.envUsers, ...next]) === 0) throw new HttpError(409, 'Der letzte Admin kann nicht gelöscht werden.');
      await this.#write(next);
      await this.audit({ user: actor.id, action: 'users.delete', id });
      return { deleted: id };
    });
  }

  /** Für /passwort (app.mjs): eigenes Passwort setzen — Env-Benutzer über passwords.json, sonst users.json */
  async set(id, hash) {
    if (this.#source(id) === 'env') {
      if (!this.passwords) throw new Error('Passwortspeicher fehlt');
      await this.passwords.set(id, hash);
      return;
    }
    await this.#serial(async () => {
      if (!this.fileUsers.some((u) => u.id === id)) throw new Error(`Unbekannter Benutzer: ${id}`);
      const ts = this.now().toISOString();
      await this.#write(this.fileUsers.map((u) => (u.id === id ? { ...u, hash, updatedAt: ts, updatedBy: id } : u)));
    });
  }

  async drain() {
    await this.queue;
  }
}
