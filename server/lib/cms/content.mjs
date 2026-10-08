/**
 * Hilfen rund um SiteDocs: Inhalts-Hash (ohne meta), automatische Weiterleitungen bei Slug-Änderungen,
 * Nachspielen serverseitiger Änderungen (Medien, Weiterleitungen) auf einen später gespeicherten Entwurf.
 */
import { createHash } from 'node:crypto';
import { HttpError } from '../http.mjs';
import { collectMediaRefs } from '../../../src/cms/validate.mjs';

/** JSON mit sortierten Schlüsseln (stabil für Hashes) */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const hashCache = new WeakMap();
/** Hash des Inhalts ohne meta — gleicher Inhalt ⇒ gleicher Hash, egal welche Revision */
export function contentHash(doc) {
  if (doc && typeof doc === 'object' && hashCache.has(doc)) return hashCache.get(doc);
  const { meta, ...rest } = doc ?? {};
  const h = createHash('sha256').update(stableStringify(rest)).digest('hex').slice(0, 32);
  if (doc && typeof doc === 'object') hashCache.set(doc, h);
  return h;
}

export function withoutMeta(doc) {
  const { meta, ...rest } = doc;
  return rest;
}

const pathOf = (slug) => (slug ? `/${slug}` : '/');

/**
 * Weiterleitungen für Seiten, deren Adresse sich zwischen prev (veröffentlicht) und next (Entwurf) ändert.
 * Vorlagenseiten (karte/*) bekommen je Kategorie eine Weiterleitung.
 * @returns {{ from: string, to: string, status: 301 }[]}
 */
export function slugChangeRedirects(prev, next) {
  const out = [];
  if (!prev || !Array.isArray(prev.pages) || !Array.isArray(next?.pages)) return out;
  const menu = Array.isArray(next.collections?.menu) ? next.collections.menu : [];
  for (const p of next.pages) {
    const old = prev.pages.find((x) => x.id === p.id);
    if (!old || old.slug === p.slug || old.status !== 'published' || p.status !== 'published' || old.system || p.system) continue;
    if (typeof old.slug !== 'string' || typeof p.slug !== 'string') continue;
    if (old.template === 'menu-category' && p.template === 'menu-category') {
      const a = old.slug.replace(/\/\*$/, '');
      const b = p.slug.replace(/\/\*$/, '');
      for (const c of menu) {
        if (typeof c?.slug !== 'string') continue;
        if (next.pages.some((x) => x.slug === `${b}/${c.slug}`)) continue; // eigene Seite übernimmt
        out.push({ from: `/${a}/${c.slug}`, to: `/${b}/${c.slug}`, status: 301 });
      }
      continue;
    }
    if (old.template || p.template || old.slug === '') continue; // Startseite wird nie umgeleitet
    out.push({ from: pathOf(old.slug), to: pathOf(p.slug), status: 301 });
  }
  return out;
}

/**
 * Neue Weiterleitungen in eine Liste einfügen: gleiche Quelle ersetzen, Ketten verkürzen
 * (alt → from wird zu alt → to), Weiterleitungen von der neuen Zieladresse entfernen (Schleifenschutz).
 * @returns {object[]} neue Liste (Eingabe bleibt unverändert)
 */
export function mergeRedirects(existing, added, createdAt) {
  let list = Array.isArray(existing) ? existing.map((r) => ({ ...r })) : [];
  for (const r of added) {
    list = list.filter((x) => x.from !== r.from && x.from !== r.to);
    for (const x of list) if (x.to === r.from) x.to = r.to;
    list = list.filter((x) => x.from !== x.to);
    list.push({ ...r, createdAt });
  }
  return list;
}

/** Wird ein Bild im Dokument verwendet? */
export function mediaIsUsed(doc, id) {
  return collectMediaRefs(doc).some((r) => r.id === id);
}

/**
 * Serverseitige Änderungen (seit der Basis-Revision des Clients) auf ein neues Dokument nachspielen.
 * ops: { type: 'media.add', item } | { type: 'media.update', id, set } | { type: 'media.delete', id }
 *      | { type: 'redirects.add', redirects }
 * @throws HttpError 409, wenn ein gelöschtes Bild im neuen Dokument noch verwendet wird
 */
export function replayOps(doc, ops) {
  const out = { ...doc, media: Array.isArray(doc.media) ? doc.media.map((m) => ({ ...m })) : [] };
  for (const op of ops) {
    if (op.type === 'media.add') {
      if (!out.media.some((m) => m.id === op.item.id)) out.media.push({ ...op.item });
    } else if (op.type === 'media.update') {
      const m = out.media.find((x) => x.id === op.id);
      if (m) Object.assign(m, op.set);
    } else if (op.type === 'media.delete') {
      if (mediaIsUsed(out, op.id)) {
        throw new HttpError(409, `Das Bild „${op.id}" wurde inzwischen gelöscht, wird in deinem Stand aber noch verwendet — bitte neu laden.`);
      }
      out.media = out.media.filter((m) => m.id !== op.id);
    } else if (op.type === 'redirects.add') {
      out.redirects = mergeRedirects(out.redirects, op.redirects, op.createdAt);
    }
  }
  return out;
}

/** Upload-Dateien, auf die ein Dokument verweist ('media/<datei>') */
export function referencedFiles(doc) {
  const out = new Set();
  for (const m of Array.isArray(doc?.media) ? doc.media : []) {
    if (m?.kind === 'upload' && typeof m.file === 'string') out.add(m.file);
    if (typeof m?.replacedBy === 'string') out.add(m.replacedBy);
  }
  return out;
}
