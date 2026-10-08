/**
 * CMS-Speicher (docs/CMS-PLAN.md §7.1) unter <dataDir>/cms:
 *
 *   draft.json       Entwurf (SiteDoc + meta { revision, updatedAt, updatedBy, fullRevision, ops })
 *   published.json   veröffentlichter Stand (SiteDoc + meta { revision, publishedAt, publishedBy })
 *   versions/        <zeit>-r<rev>.json je Veröffentlichung + index.json (höchstens 100)
 *   backups/         Originale vor Migrationen bzw. kaputte Dateien
 *
 * Alle Änderungen laufen seriell über eine Queue, Dateien werden atomar geschrieben, jede Änderung
 * landet als Audit-Event in <dataDir>/events.jsonl.
 *
 * Revisionen & Konflikte: Jede Änderung am Entwurf erhöht meta.revision. Ganze Speichervorgänge
 * (PUT, Verwerfen, Wiederherstellen, Migration) setzen fullRevision; serverseitige Einzeländerungen
 * (Medien-Upload/-Ersatz/-Löschen, automatische Weiterleitungen) werden als ops gemerkt. Ein Client mit
 * baseRevision ≥ fullRevision darf speichern — die ops danach werden auf sein Dokument nachgespielt.
 * Ältere Basis → 409 Konflikt.
 */
import { appendFile, mkdir, readdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../http.mjs';
import { writeFileAtomic } from '../store.mjs';
import { contentHash, mergeRedirects, replayOps, slugChangeRedirects, withoutMeta } from './content.mjs';
import { MIGRATIONS, TARGET_SCHEMA_VERSION, migrateDoc } from './migrations.mjs';

const VERSION_ID_RE = /^\d{8}T\d{6}\d{3}Z-r\d+$/;
const MAX_OPS = 200;

/** Audit-Log events.jsonl (gemeinsam mit Checkliste/Modul-Board); Fehler hier brechen nie einen Commit. */
export function createAuditor(dataDir, now = () => new Date(), log = console) {
  return async (event) => {
    try {
      await appendFile(path.join(dataDir, 'events.jsonl'), `${JSON.stringify({ at: now().toISOString(), ...event })}\n`, { mode: 0o640 });
    } catch (err) {
      try {
        log.error?.(`[cms] events.jsonl nicht schreibbar: ${err?.message ?? err}`);
      } catch {
        /* nichts */
      }
    }
  };
}

const stamp = (d) => d.toISOString().replace(/[-:.]/g, '');

export class CmsStore {
  /**
   * @param {{ dataDir: string, seed: () => object, now?: () => Date, log?: Console, audit?: (e: object) => Promise<void>,
   *           migrations?: object[], targetVersion?: number, maxVersions?: number }} opts
   */
  constructor({ dataDir, seed, now = () => new Date(), log = console, audit, migrations = MIGRATIONS, targetVersion = TARGET_SCHEMA_VERSION, maxVersions = 100 }) {
    this.dataDir = dataDir;
    this.dir = path.join(dataDir, 'cms');
    this.versionsDir = path.join(this.dir, 'versions');
    this.backupsDir = path.join(this.dir, 'backups');
    this.seed = seed;
    this.now = now;
    this.log = log;
    this.audit = audit ?? createAuditor(dataDir, now, log);
    this.migrations = migrations;
    this.targetVersion = targetVersion;
    this.maxVersions = maxVersions;
    this.queue = Promise.resolve();
    this.draftDoc = null;
    this.publishedDoc = null;
    this.versionIndex = [];
    this.readOnly = null;
    this.seeded = false;
  }

  get draftFile() {
    return path.join(this.dir, 'draft.json');
  }
  get publishedFile() {
    return path.join(this.dir, 'published.json');
  }

  /* ---------------------------------------------------------------- Start ---------- */

  async #readJson(file) {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      const backup = path.join(this.backupsDir, `${path.basename(file, '.json')}-kaputt-${stamp(this.now())}.json`);
      await rename(file, backup).catch(() => {});
      this.log.error(`[cms] ${file} ist kein gültiges JSON (${err.message}) — gesichert als ${backup}.`);
      return null;
    }
  }

  async #write(file, doc) {
    await writeFileAtomic(file, JSON.stringify(doc));
  }

  /** Migration einer geladenen Datei (mit Sicherung). → migriertes Dokument */
  async #migrateLoaded(doc, name) {
    const from = Number.isInteger(doc.schemaVersion) ? doc.schemaVersion : 1;
    if (from === this.targetVersion) return doc;
    let result;
    try {
      result = migrateDoc(doc, { migrations: this.migrations, target: this.targetVersion });
    } catch (err) {
      this.readOnly = err.message;
      this.log.error(`[cms] ${name}: ${err.message} — CMS bleibt schreibgeschützt.`);
      return doc;
    }
    const backup = path.join(this.backupsDir, `${name}-${stamp(this.now())}-v${from}.json`);
    await this.#write(backup, doc);
    this.log.info?.(`[cms] ${name}: Formatversion ${from} → ${result.to} (${result.applied.join('; ')}), Sicherung ${backup}`);
    await this.audit({ user: 'system', action: 'cms.migrate', file: name, from, to: result.to, applied: result.applied });
    return result.doc;
  }

  async init() {
    await mkdir(this.versionsDir, { recursive: true });
    await mkdir(this.backupsDir, { recursive: true });
    await this.#loadVersionIndex();

    let published = await this.#readJson(this.publishedFile);
    let draft = await this.#readJson(this.draftFile);
    const ts = this.now().toISOString();

    if (!published && this.versionIndex.length) {
      // published.json fehlt/kaputt, aber es gibt Versionen → neueste Version gilt
      const v = this.versionIndex[0];
      published = await this.#readJson(path.join(this.versionsDir, `${v.id}.json`));
      if (published) {
        this.log.error(`[cms] published.json fehlt — Version ${v.id} wird als veröffentlichter Stand übernommen.`);
        await this.#write(this.publishedFile, published);
      }
    }

    if (!published) {
      const seed = this.seed();
      seed.schemaVersion ??= this.targetVersion;
      const content = withoutMeta(await this.#migrateLoaded(seed, 'seed'));
      published = { ...content, meta: { revision: 1, updatedAt: ts, publishedAt: ts, publishedBy: 'seed' } };
      await this.#write(this.publishedFile, published);
      await this.#addVersion(published);
      this.seeded = true;
      await this.audit({ user: 'system', action: 'cms.seed', revision: 1 });
      this.log.info?.('[cms] Erststart: Grundbestand (Seed) als Entwurf und veröffentlichter Stand angelegt (Revision 1).');
    }
    if (!draft) {
      const rev = published.meta?.revision ?? 1;
      draft = { ...withoutMeta(published), meta: { revision: rev, updatedAt: ts, updatedBy: 'system', fullRevision: rev, ops: [] } };
      await this.#write(this.draftFile, draft);
    }

    // Migrationen (vorher Sicherung). Der Entwurf bekommt eine neue Revision → alte Clients bekommen 409.
    const migratedPublished = await this.#migrateLoaded(published, 'published');
    if (migratedPublished !== published) {
      published = migratedPublished;
      await this.#write(this.publishedFile, published);
    }
    const migratedDraft = await this.#migrateLoaded(draft, 'draft');
    if (migratedDraft !== draft) {
      const rev = (draft.meta?.revision ?? 0) + 1;
      draft = { ...withoutMeta(migratedDraft), meta: { revision: rev, updatedAt: ts, updatedBy: 'system', fullRevision: rev, ops: [] } };
      await this.#write(this.draftFile, draft);
    }
    // Grundbestand nachziehen: Solange niemand veröffentlicht und niemand den Entwurf geändert hat,
    // übernimmt ein Deploy mit geändertem Seed (z. B. neue Seiten der Seiten-Pakete) den neuen Grundbestand.
    // Danach gelten Inhaltsänderungen am Seed nur noch über Migrationen (migrations.mjs).
    if (!this.readOnly && published.meta?.publishedBy === 'seed' && contentHash(draft) === contentHash(published)) {
      let fresh = null;
      try {
        const s = this.seed();
        s.schemaVersion ??= this.targetVersion;
        fresh = withoutMeta(migrateDoc(s, { migrations: this.migrations, target: this.targetVersion }).doc);
      } catch (err) {
        this.log.warn(`[cms] Seed nicht lesbar — Grundbestand bleibt: ${err?.message ?? err}`);
      }
      if (fresh && contentHash(fresh) !== contentHash(published)) {
        const rev = Math.max(published.meta.revision ?? 1, draft.meta?.revision ?? 1) + 1;
        published = { ...fresh, meta: { revision: rev, updatedAt: ts, publishedAt: ts, publishedBy: 'seed' } };
        await this.#write(this.publishedFile, published);
        await this.#addVersion(published);
        draft = { ...fresh, meta: { revision: rev, updatedAt: ts, updatedBy: 'system', fullRevision: rev, ops: [] } };
        await this.#write(this.draftFile, draft);
        await this.audit({ user: 'system', action: 'cms.seed.update', revision: rev });
        this.log.info?.(`[cms] Grundbestand aus neuem Seed übernommen (bisher nie veröffentlicht) — Revision ${rev}.`);
      }
    }

    draft.meta = { revision: 1, fullRevision: 1, ops: [], ...draft.meta };
    if (!Number.isInteger(draft.meta.fullRevision)) draft.meta.fullRevision = draft.meta.revision;
    if (!Array.isArray(draft.meta.ops)) draft.meta.ops = [];
    this.draftDoc = draft;
    this.publishedDoc = published;
    return this;
  }

  /* ---------------------------------------------------------------- Lesen ---------- */

  get draft() {
    return this.draftDoc;
  }
  get published() {
    return this.publishedDoc;
  }

  draftMeta() {
    const m = this.draftDoc.meta;
    return { revision: m.revision, updatedAt: m.updatedAt, updatedBy: m.updatedBy };
  }

  publishedMeta() {
    const m = this.publishedDoc.meta ?? {};
    return { revision: m.revision, publishedAt: m.publishedAt, publishedBy: m.publishedBy };
  }

  /** Entwurf für Clients (ohne interne meta-Felder) */
  publicDraft() {
    return { ...withoutMeta(this.draftDoc), meta: this.draftMeta() };
  }

  isDirty() {
    return contentHash(this.draftDoc) !== contentHash(this.publishedDoc);
  }

  /* ---------------------------------------------------------------- Schreiben ------ */

  #serial(fn) {
    const run = this.queue.then(() => {
      if (this.readOnly) throw new HttpError(503, `Inhalte sind schreibgeschützt: ${this.readOnly}`);
      return fn();
    });
    this.queue = run.catch(() => {});
    return run;
  }

  #conflict(base) {
    const m = this.draftDoc.meta;
    const err = new HttpError(409, 'Der Entwurf wurde inzwischen geändert (anderer Tab oder andere Person). Bitte neu laden — deine Änderungen gehen sonst verloren.');
    err.body = { revision: m.revision, updatedAt: m.updatedAt, updatedBy: m.updatedBy, baseRevision: base };
    return err;
  }

  /** Basis-Revision eines Clients prüfen → Liste der nachzuspielenden ops */
  #opsSince(base) {
    const m = this.draftDoc.meta;
    if (!Number.isInteger(base)) throw new HttpError(400, 'baseRevision fehlt oder ist keine Zahl.');
    if (base > m.revision || base < m.fullRevision) throw this.#conflict(base);
    return m.ops.filter((o) => o.rev > base);
  }

  async #setDraft(content, meta) {
    const doc = { ...content, meta };
    await this.#write(this.draftFile, doc);
    this.draftDoc = doc;
    return doc;
  }

  #fullMeta(user) {
    const rev = this.draftDoc.meta.revision + 1;
    return { revision: rev, updatedAt: this.now().toISOString(), updatedBy: user.id, fullRevision: rev, ops: [] };
  }

  /**
   * Entwurf komplett speichern.
   * @param {{ doc: object, baseRevision: number, user: { id: string }, validate: (doc: object) => { warnings?: object[] } }} args
   *   validate wirft HttpError 422 bei Fehlern
   */
  saveDraft({ doc, baseRevision, user, validate }) {
    return this.#serial(async () => {
      const ops = this.#opsSince(baseRevision);
      let content = withoutMeta(doc);
      if (content.schemaVersion !== undefined && content.schemaVersion !== this.targetVersion) {
        throw new HttpError(409, 'Das Inhaltsformat hat sich geändert — bitte die Seite neu laden.');
      }
      content.schemaVersion = this.targetVersion;
      if (ops.length) content = replayOps(content, ops);
      const result = validate(content) ?? {};
      const meta = this.#fullMeta(user);
      await this.#setDraft(content, meta);
      await this.audit({ user: user.id, action: 'cms.draft.save', revision: meta.revision, base: baseRevision, ...(ops.length ? { replayed: ops.length } : {}) });
      return { revision: meta.revision, updatedAt: meta.updatedAt, warnings: result.warnings ?? [] };
    });
  }

  /**
   * Serverseitige Einzeländerung am Entwurf (Medien). fn(kopie) verändert die Kopie und liefert { op, result, event }.
   * op wird für spätere PUTs mit älterer Basis gemerkt.
   */
  updateDraft(user, fn) {
    return this.#serial(async () => {
      const m = this.draftDoc.meta;
      const copy = structuredClone(withoutMeta(this.draftDoc));
      const { op, result, event } = await fn(copy);
      const rev = m.revision + 1;
      let ops = [...m.ops, { ...op, rev }];
      let fullRevision = m.fullRevision;
      if (ops.length > MAX_OPS) {
        const dropped = ops.slice(0, ops.length - MAX_OPS);
        ops = ops.slice(-MAX_OPS);
        fullRevision = Math.max(fullRevision, dropped.at(-1).rev);
      }
      await this.#setDraft(copy, { revision: rev, updatedAt: this.now().toISOString(), updatedBy: user.id, fullRevision, ops });
      if (event) await this.audit({ user: user.id, revision: rev, ...event });
      return { result, revision: rev };
    });
  }

  /** Entwurf = veröffentlichter Stand */
  discard(user) {
    return this.#serial(async () => {
      const meta = this.#fullMeta(user);
      await this.#setDraft(withoutMeta(this.publishedDoc), meta);
      await this.audit({ user: user.id, action: 'cms.draft.discard', revision: meta.revision });
      return { revision: meta.revision, updatedAt: meta.updatedAt };
    });
  }

  /** Version → Entwurf (validate wie beim Speichern) */
  restore(id, user, validate) {
    return this.#serial(async () => {
      const version = await this.readVersion(id);
      if (!version) throw new HttpError(404, 'Version nicht gefunden.');
      let content = withoutMeta(version);
      try {
        content = withoutMeta(migrateDoc(content, { migrations: this.migrations, target: this.targetVersion }).doc);
      } catch (err) {
        throw new HttpError(422, `Diese Version lässt sich nicht wiederherstellen: ${err.message}`);
      }
      validate(content);
      const meta = this.#fullMeta(user);
      await this.#setDraft(content, meta);
      await this.audit({ user: user.id, action: 'cms.version.restore', id, revision: meta.revision });
      return { revision: meta.revision, updatedAt: meta.updatedAt };
    });
  }

  /**
   * Entwurf veröffentlichen: prüfen → Weiterleitungen bei Slug-Änderungen ergänzen → published.json → Version.
   * Unveränderter Inhalt → keine neue Version (nur Neubau). Das Bauen übernimmt der Aufrufer.
   * @returns {Promise<{ revision: number, changed: boolean, redirects: object[], draftRevision: number, version: object|null }>}
   */
  publish({ revision, user, validate }) {
    return this.#serial(async () => {
      this.#opsSince(revision);
      const m = this.draftDoc.meta;
      let content = withoutMeta(this.draftDoc);
      validate(content);
      const ts = this.now().toISOString();
      const added = slugChangeRedirects(this.publishedDoc, content);
      let rev = m.revision;
      if (added.length) {
        content = { ...content, redirects: mergeRedirects(content.redirects, added, ts) };
        rev = m.revision + 1;
        const ops = [...m.ops, { type: 'redirects.add', redirects: added, createdAt: ts, rev }].slice(-MAX_OPS);
        await this.#setDraft(content, { ...m, revision: rev, updatedAt: ts, updatedBy: user.id, ops });
      }
      if (contentHash(content) === contentHash(this.publishedDoc)) {
        return { revision: this.publishedDoc.meta.revision, changed: false, redirects: [], draftRevision: rev, version: null };
      }
      const published = { ...content, meta: { revision: rev, updatedAt: ts, publishedAt: ts, publishedBy: user.id } };
      await this.#write(this.publishedFile, published);
      this.publishedDoc = published;
      const version = await this.#addVersion(published);
      await this.audit({ user: user.id, action: 'cms.publish', revision: rev, version: version.id, ...(added.length ? { redirects: added } : {}) });
      return { revision: rev, changed: true, redirects: added, draftRevision: rev, version };
    });
  }

  /* ---------------------------------------------------------------- Versionen ------ */

  async #loadVersionIndex() {
    const raw = await this.#readJson(path.join(this.versionsDir, 'index.json'));
    if (Array.isArray(raw)) {
      this.versionIndex = raw.filter((v) => v && VERSION_ID_RE.test(v.id));
      return;
    }
    // Index fehlt/kaputt → aus den Dateien neu aufbauen
    const files = (await readdir(this.versionsDir).catch(() => [])).filter((f) => VERSION_ID_RE.test(f.replace(/\.json$/, ''))).sort().reverse();
    const index = [];
    for (const f of files) {
      const doc = await this.#readJson(path.join(this.versionsDir, f));
      if (!doc) continue;
      index.push({ id: f.replace(/\.json$/, ''), revision: doc.meta?.revision, publishedAt: doc.meta?.publishedAt, publishedBy: doc.meta?.publishedBy });
    }
    this.versionIndex = index;
    if (index.length) await this.#write(path.join(this.versionsDir, 'index.json'), index);
  }

  async #addVersion(doc) {
    const id = `${stamp(this.now())}-r${doc.meta.revision}`;
    await this.#write(path.join(this.versionsDir, `${id}.json`), doc);
    const entry = { id, revision: doc.meta.revision, publishedAt: doc.meta.publishedAt, publishedBy: doc.meta.publishedBy };
    const index = [entry, ...this.versionIndex.filter((v) => v.id !== id)];
    const keep = index.slice(0, this.maxVersions);
    await this.#write(path.join(this.versionsDir, 'index.json'), keep);
    this.versionIndex = keep;
    for (const old of index.slice(this.maxVersions)) {
      await unlink(path.join(this.versionsDir, `${old.id}.json`)).catch(() => {});
    }
    return entry;
  }

  listVersions() {
    return this.versionIndex.map(({ id, revision, publishedAt, publishedBy }) => ({ id, revision, publishedAt, publishedBy }));
  }

  async readVersion(id) {
    if (typeof id !== 'string' || !VERSION_ID_RE.test(id) || !this.versionIndex.some((v) => v.id === id)) return null;
    return this.#readJson(path.join(this.versionsDir, `${id}.json`));
  }

  async drain() {
    await this.queue;
  }
}
