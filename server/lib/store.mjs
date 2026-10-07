/**
 * Persistenz (docs/LIVE-PLAN.md §2.6): JSON-Dateien unter SUS_DATA_DIR, atomar geschrieben
 * (tmp + fsync + rename + Verzeichnis-fsync), alle Schreibzugriffe über eine serielle Queue,
 * Audit-Log events.jsonl, Seed-Merge beim Start.
 */
import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { mergeSeed } from './model.mjs';

const FILES = {
  checklist: { name: 'checklist.json', empty: () => ({ items: [], comments: [] }) },
  module: { name: 'module.json', empty: () => ({ votes: [], choices: [] }) },
};

/** Seed-Datei tolerant lesen: fehlt sie oder ist sie kaputt → leere Liste. */
export async function readSeedItems(seedFile, log = console) {
  let text;
  try {
    text = await readFile(seedFile, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`[store] Seed nicht lesbar (${seedFile}): ${err.message}`);
    return [];
  }
  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) {
      log.warn(`[store] Seed ${seedFile} enthält kein items-Array — ignoriert.`);
      return [];
    }
    return items;
  } catch (err) {
    log.warn(`[store] Seed ${seedFile} ist kein gültiges JSON — ignoriert (${err.message}).`);
    return [];
  }
}

/** Atomar schreiben: tmp-Datei, fsync, rename, Verzeichnis-fsync (best effort). */
export async function writeFileAtomic(file, content) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  const fh = await open(tmp, 'w', 0o640);
  try {
    await fh.writeFile(content);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  try {
    const dh = await open(dir, 'r');
    try {
      await dh.sync();
    } finally {
      await dh.close();
    }
  } catch {
    /* Verzeichnis-fsync ist nicht überall möglich */
  }
}

export class Store {
  /**
   * @param {{ dataDir: string, seedFile?: string, now?: () => Date, log?: Console }} opts
   */
  constructor({ dataDir, seedFile, now = () => new Date(), log = console }) {
    this.dataDir = dataDir;
    this.seedFile = seedFile;
    this.now = now;
    this.log = log;
    this.data = { checklist: FILES.checklist.empty(), module: FILES.module.empty() };
    this.queue = Promise.resolve();
  }

  #path(key) {
    return path.join(this.dataDir, FILES[key].name);
  }

  async #load(key) {
    const file = this.#path(key);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return FILES[key].empty();
      throw err;
    }
    try {
      const data = JSON.parse(text);
      const empty = FILES[key].empty();
      for (const k of Object.keys(empty)) if (!Array.isArray(data[k])) data[k] = empty[k];
      return data;
    } catch (err) {
      // Kaputte Datei nicht überschreiben, sondern sichern und leer weitermachen.
      const backup = `${file}.kaputt-${Date.now()}`;
      await rename(file, backup).catch(() => {});
      this.log.error(`[store] ${file} ist kein gültiges JSON (${err.message}) — gesichert als ${backup}, starte leer.`);
      return FILES[key].empty();
    }
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    this.data.checklist = await this.#load('checklist');
    this.data.module = await this.#load('module');
    if (this.seedFile) {
      const seedItems = await readSeedItems(this.seedFile, this.log);
      if (seedItems.length) {
        const nowIso = this.now().toISOString();
        const { state, added, updated } = mergeSeed(this.data.checklist, seedItems, nowIso);
        if (added.length || updated.length) {
          await writeFileAtomic(this.#path('checklist'), JSON.stringify(state, null, 2));
          this.data.checklist = state;
          await this.#audit({ user: 'seed', action: 'seed.merge', added, updated });
          this.log.info?.(`[store] Seed: ${added.length} ergänzt, ${updated.length} aktualisiert.`);
        }
      }
    }
    return this;
  }

  get checklist() {
    return this.data.checklist;
  }

  get module() {
    return this.data.module;
  }

  async #audit(event) {
    try {
      const line = JSON.stringify({ at: this.now().toISOString(), ...event }) + '\n';
      await appendFile(path.join(this.dataDir, 'events.jsonl'), line, { mode: 0o640 });
    } catch (err) {
      // Der Zustands-Commit ist zu diesem Zeitpunkt bereits dauerhaft geschrieben. Ein
      // Auditfehler darf deshalb keinen 500er und keinen falschen Client-Rollback auslösen.
      try {
        this.log.error?.(`[store] events.jsonl nicht schreibbar: ${err?.message ?? err}`);
      } catch {
        /* Auch ein fehlerhafter Logger darf einen erfolgreichen Commit nicht umdeuten. */
      }
    }
  }

  /**
   * Serialisierte Änderung: mutator(entwurf) arbeitet auf einer Kopie und liefert
   * { result, event }. Erst nach erfolgreichem Schreiben wird die Kopie übernommen.
   * Wirft der mutator (z. B. HttpError 404), bleibt alles unverändert.
   * @param {'checklist'|'module'} key
   * @param {(draft: any) => { result: any, event?: object }} mutator
   */
  update(key, mutator) {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.data[key]);
      const { result, event } = mutator(draft);
      await writeFileAtomic(this.#path(key), JSON.stringify(draft, null, 2));
      this.data[key] = draft;
      if (event) await this.#audit(event);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  /** Wartet, bis alle laufenden Schreibvorgänge fertig sind (Shutdown). */
  async drain() {
    await this.queue;
  }
}
