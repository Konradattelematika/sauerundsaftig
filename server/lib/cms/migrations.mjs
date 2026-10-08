/**
 * Schema-Migrationen für SiteDocs (docs/CMS-PLAN.md §3). `schemaVersion` im Dokument, Zielversion =
 * CMS_SCHEMA_VERSION aus src/cms/store.mjs. Jede Migration hebt genau eine Version an:
 *
 *   { from: 1, to: 2, description: 'kurz, was passiert', up(doc) { …; return doc; } }
 *
 * up() bekommt eine Kopie und darf sie verändern. Vor jeder Migration einer Datei sichert der Speicher
 * das Original unter cms/backups/ (server/lib/cms/store.mjs). Versionen (cms/versions/) werden erst beim
 * Wiederherstellen migriert.
 */
import { CMS_SCHEMA_VERSION } from '../../../src/cms/store.mjs';

/** @type {{ from: number, to: number, description: string, up: (doc: object) => object }[]} */
export const MIGRATIONS = [
  // Beispiel für die nächste Formatänderung:
  // { from: 1, to: 2, description: 'Seiten bekommen ein Feld x', up(doc) { for (const p of doc.pages) p.x ??= ''; return doc; } },
];

export const TARGET_SCHEMA_VERSION = CMS_SCHEMA_VERSION;

/**
 * Dokument auf die Zielversion bringen.
 * @returns {{ doc: object, applied: string[], from: number, to: number }}
 * @throws Error, wenn das Dokument neuer ist als dieser Code oder ein Migrationsschritt fehlt
 */
export function migrateDoc(doc, { migrations = MIGRATIONS, target = TARGET_SCHEMA_VERSION } = {}) {
  const from = Number.isInteger(doc?.schemaVersion) ? doc.schemaVersion : 1;
  if (from > target) {
    const err = new Error(`Inhalt hat Formatversion ${from}, dieser Server kennt nur bis ${target} (älterer Code nach einem Rollback?)`);
    err.code = 'SCHEMA_TOO_NEW';
    throw err;
  }
  let cur = structuredClone(doc);
  cur.schemaVersion = from;
  const applied = [];
  while (cur.schemaVersion < target) {
    const step = migrations.find((m) => m.from === cur.schemaVersion);
    if (!step) throw new Error(`Keine Migration von Formatversion ${cur.schemaVersion} vorhanden`);
    cur = step.up(cur) ?? cur;
    cur.schemaVersion = step.to;
    applied.push(`${step.from}→${step.to}: ${step.description}`);
  }
  return { doc: cur, applied, from, to: cur.schemaVersion };
}
