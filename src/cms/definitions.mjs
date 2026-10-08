/**
 * Sektions- und Sammlungs-Definitionen per Dateisystem laden (Server; docs/CMS-PLAN.md §4, §7).
 * Der Astro-Build nutzt stattdessen import.meta.glob (src/cms/sections/registry.ts), der Admin ebenso —
 * Quelle ist in allen Fällen dieselbe Datei je Typ:
 *
 *   src/cms/sections/<typ>/definition.mjs   export default SectionDefinition
 *   src/cms/collections/<name>.mjs          export default CollectionDefinition
 *
 * Typ-Schlüssel ist der Ordnername (wie in der Registry), Sammlungs-Schlüssel `name` bzw. der Dateiname.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let cached = null;

/**
 * @param {{ root?: string, reload?: boolean, log?: { warn: Function } }} [opts]  root = Ordner mit sections/ und collections/
 * @returns {Promise<{ sections: Record<string, import('./types').SectionDefinition>, collections: Record<string, import('./types').CollectionDefinition> }>}
 */
export async function loadDefinitions(opts = {}) {
  const root = opts.root ?? HERE;
  if (cached && !opts.reload && cached.root === root) return cached.defs;
  const log = opts.log ?? console;

  const sections = {};
  const sectionsDir = path.join(root, 'sections');
  if (existsSync(sectionsDir)) {
    const dirs = readdirSync(sectionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const type of dirs) {
      const file = path.join(sectionsDir, type, 'definition.mjs');
      if (!existsSync(file)) continue;
      const def = (await import(pathToFileURL(file).href)).default;
      if (!def || typeof def !== 'object' || !Array.isArray(def.fields)) {
        log.warn?.(`[cms] Sektion „${type}": definition.mjs exportiert keine gültige Definition — ignoriert.`);
        continue;
      }
      if (def.type && def.type !== type) {
        log.warn?.(`[cms] Sektion „${type}": type „${def.type}" weicht vom Ordnernamen ab — Ordnername gilt.`);
      }
      sections[type] = def;
    }
  }

  const collections = {};
  const collectionsDir = path.join(root, 'collections');
  if (existsSync(collectionsDir)) {
    const files = readdirSync(collectionsDir)
      .filter((f) => f.endsWith('.mjs'))
      .sort();
    for (const f of files) {
      const def = (await import(pathToFileURL(path.join(collectionsDir, f)).href)).default;
      if (!def || typeof def !== 'object' || !Array.isArray(def.fields)) {
        log.warn?.(`[cms] Sammlung ${f}: keine gültige Definition — ignoriert.`);
        continue;
      }
      collections[def.name || f.replace(/\.mjs$/, '')] = def;
    }
  }

  const defs = { sections, collections };
  cached = { root, defs };
  return defs;
}
