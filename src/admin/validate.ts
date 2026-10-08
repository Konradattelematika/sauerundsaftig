/**
 * Prüfhinweise: die gemeinsame Prüfung src/cms/validate.mjs (`validateSiteDoc`, Paket S — dieselbe wie
 * beim Speichern/Veröffentlichen auf dem Server) plus einige schnelle eigene Prüfungen, die dort fehlen
 * (Zahlenbereiche, Adress-Kollisionen beim Anlegen, Öffnungszeiten-Reihenfolge). Alle Meldungen tragen
 * einen Pfad im SiteDoc ('pages.3.sections.1.fields.title'); bei gleichem Pfad gilt die gemeinsame Meldung.
 */
import type { SiteDoc } from '../cms/types';
import { validateSiteDoc } from '../cms/validate.mjs';
import { COLLECTION_DEFS, RESERVED_SLUGS, SECTION_DEFS, SETTINGS_GROUPS } from './defs';
import { checkHref, knownPaths, mediaIdOf, walkDoc } from './scan';
import { canonicalPath, getAt, isPlainObject } from './util';

export interface Issue {
  path: string;
  message: string;
  level: 'error' | 'warning';
  source?: 'client' | 'shared' | 'server';
}

/**
 * Meldungen der gemeinsamen Prüfung beginnen mit dem Ort („Seite „Start“ › Abschnitt „Text“ › Überschrift: …“).
 * Am Feld selbst genügt der Teil nach dem Ort.
 */
export function shortMessage(message: string): string {
  const i = message.indexOf(': ');
  return i > 0 && message.slice(0, i).includes('›') ? message.slice(i + 2) : message;
}

/** Ergebnis-Formen tolerieren: Issue[] · { errors, warnings } · { ok, errors } */
export function normalizeIssues(raw: unknown, doc: SiteDoc, source: Issue['source']): Issue[] {
  const list: unknown[] = [];
  if (Array.isArray(raw)) list.push(...raw);
  else if (isPlainObject(raw)) {
    for (const key of ['errors', 'issues']) if (Array.isArray(raw[key])) list.push(...(raw[key] as unknown[]));
    if (Array.isArray(raw.warnings)) list.push(...(raw.warnings as unknown[]).map((w) => (isPlainObject(w) ? { ...w, level: 'warning' } : w)));
  }
  return list
    .filter(isPlainObject)
    .map((x) => ({
      path: canonicalPath(doc, String(x.path ?? '')),
      message: String(x.message ?? x.error ?? 'Ungültiger Wert'),
      level: x.level === 'warning' || x.severity === 'warning' ? ('warning' as const) : ('error' as const),
      source,
    }));
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*(?:\/\*)?$/;

/** Prüft eine Seitenadresse (ohne führenden Slash). Rückgabe: Fehlermeldung oder null. */
export function slugProblem(slug: string, doc: SiteDoc, ownId?: string): string | null {
  if (slug === '') return doc.pages.some((p) => p.slug === '' && p.id !== ownId) ? 'Es gibt schon eine Startseite.' : null;
  if (!SLUG_RE.test(slug)) return 'Nur Kleinbuchstaben (a–z), Ziffern, Bindestriche und / sind erlaubt — keine Umlaute oder Leerzeichen.';
  const first = slug.split('/')[0];
  if (RESERVED_SLUGS.has(first) || RESERVED_SLUGS.has(slug)) return `„/${slug}“ ist für die Technik reserviert.`;
  const other = doc.pages.find((p) => p.slug === slug && p.id !== ownId);
  if (other) return `Diese Adresse hat schon die Seite „${other.title}“.`;
  const tpl = doc.pages.find((p) => p.template === 'menu-category' && p.id !== ownId);
  if (tpl) {
    const parent = tpl.slug.replace(/\/\*$/, '');
    if (slug.startsWith(`${parent}/`) && (doc.collections?.menu ?? []).some((c) => `${parent}/${c.slug}` === slug)) {
      const own = doc.pages.find((p) => p.id === ownId);
      if (!own || own.slug !== slug) return `Unter /${slug} liegt schon eine Karten-Kategorie.`;
    }
  }
  return null;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v) && 'media' in v) return !v.media;
  if (isPlainObject(v) && 'href' in v && 'label' in v) return !String(v.label ?? '').trim();
  return false;
}

export function clientIssues(doc: SiteDoc): Issue[] {
  const out: Issue[] = [];
  const add = (path: (string | number)[], message: string, level: Issue['level'] = 'error') =>
    out.push({ path: path.join('.'), message, level, source: 'client' });
  const paths = knownPaths(doc);
  const mediaIds = new Set((doc.media ?? []).map((m) => m.id));

  walkDoc(doc, ({ def, value, loc }) => {
    const p = loc.path;
    if (def.required && def.kind !== 'boolean' && isEmpty(value)) add(p, 'Bitte ausfüllen.');
    if (def.maxLength && typeof value === 'string' && value.length > def.maxLength)
      add(p, `Zu lang: ${value.length} von höchstens ${def.maxLength} Zeichen.`);
    if (def.kind === 'number' && typeof value === 'number') {
      if (Number.isNaN(value)) add(p, 'Bitte eine Zahl eingeben.');
      else if (def.min !== undefined && value < def.min) add(p, `Mindestens ${String(def.min).replace('.', ',')}.`);
      else if (def.max !== undefined && value > def.max) add(p, `Höchstens ${String(def.max).replace('.', ',')}.`);
    }
    if (def.kind === 'list' && Array.isArray(value)) {
      if (def.min !== undefined && value.length < def.min) add(p, `Mindestens ${def.min} Einträge nötig.`);
      if (def.max !== undefined && value.length > def.max) add(p, `Höchstens ${def.max} Einträge möglich.`);
    }
    if (def.kind === 'link' && isPlainObject(value)) {
      const hidden = value.visible === false;
      if (!hidden && (value.label || def.required)) {
        const c = checkHref(String(value.href ?? ''), doc, paths);
        if (c) add([...p, 'href'], c.message, c.level);
      }
      if (def.maxLength && typeof value.label === 'string' && value.label.length > def.maxLength) add([...p, 'label'], 'Beschriftung zu lang.');
    }
    if (def.kind === 'href' && (typeof value === 'string' ? value : '') !== '' ) {
      const c = checkHref(String(value), doc, paths);
      if (c) add(p, c.message, c.level);
    }
    if (def.kind === 'media' || def.idOnly) {
      const id = mediaIdOf(value);
      if (id && !mediaIds.has(id)) add(p, 'Dieses Bild fehlt in der Medienbibliothek.');
    }
    if (def.kind === 'page' && typeof value === 'string' && value && !doc.pages.some((x) => x.id === value))
      add(p, 'Diese Seite gibt es nicht (mehr).');
  });

  // Seiten: IDs, Adressen, SEO-Grundlagen, Sektions-IDs
  const ids = new Set<string>();
  doc.pages.forEach((page, i) => {
    if (ids.has(page.id)) add(['pages', i, 'id'], 'Doppelte Seiten-ID.');
    ids.add(page.id);
    if (!page.title?.trim()) add(['pages', i, 'title'], 'Bitte einen Seitentitel angeben.');
    if (!page.system && page.template !== 'menu-category') {
      const prob = slugProblem(page.slug, doc, page.id);
      if (prob) add(['pages', i, 'slug'], prob);
    }
    if (!page.seo?.title?.trim()) add(['pages', i, 'seo', 'title'], 'Suchmaschinen-Titel fehlt.', 'warning');
    if (!page.seo?.description?.trim() && !page.seo?.noindex) add(['pages', i, 'seo', 'description'], 'Beschreibung für Suchmaschinen fehlt.', 'warning');
    if (page.seo?.canonical && !/^https?:\/\/[^\s]+\.[^\s]+/.test(page.seo.canonical)) add(['pages', i, 'seo', 'canonical'], 'Muss eine vollständige Adresse (https://…) sein.');
    const sids = new Set<string>();
    (page.sections ?? []).forEach((s, si) => {
      if (sids.has(s.id)) add(['pages', i, 'sections', si], 'Doppelte Sektions-ID.');
      sids.add(s.id);
    });
  });

  // Karten-Kategorien
  const catSlugs = new Set<string>();
  (doc.collections?.menu ?? []).forEach((c, i) => {
    if (c.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) add(['collections', 'menu', i, 'slug'], 'Nur Kleinbuchstaben, Ziffern und Bindestriche.');
    if (catSlugs.has(c.slug)) add(['collections', 'menu', i, 'slug'], 'Diese Adresse hat schon eine andere Kategorie.');
    catSlugs.add(c.slug);
    (c.items ?? []).forEach((it, j) => {
      if (typeof it.price === 'number' && (it.price < 0 || Number.isNaN(it.price))) add(['collections', 'menu', i, 'items', j, 'price'], 'Ungültiger Preis.');
    });
  });

  // Einstellungen (Pflichtfelder)
  for (const g of SETTINGS_GROUPS) {
    const obj = getAt(doc.settings, g.path);
    for (const f of g.fields) {
      const v = isPlainObject(obj) ? obj[f.key] : undefined;
      if (f.required && isEmpty(v)) add(['settings', ...g.path, f.key], 'Bitte ausfüllen.');
      if (f.input === 'email' && typeof v === 'string' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) add(['settings', ...g.path, f.key], 'Ungültige E-Mail-Adresse.');
      if (f.input === 'url' && typeof v === 'string' && v && !/^https?:\/\/[^\s]+\.[^\s]+/.test(v)) add(['settings', ...g.path, f.key], 'Muss mit https:// beginnen.');
    }
  }
  const hours = doc.settings?.openingHours;
  if (hours?.week) {
    for (const [day, spans] of Object.entries(hours.week)) {
      (spans ?? []).forEach((sp, i) => {
        if (!/^\d\d:\d\d$/.test(sp[0] ?? '') || !/^\d\d:\d\d$/.test(sp[1] ?? '')) add(['settings', 'openingHours', 'week', day, i], 'Bitte Uhrzeiten angeben.');
        else if (sp[0] >= sp[1]) add(['settings', 'openingHours', 'week', day, i], '„Bis“ muss nach „von“ liegen.');
      });
    }
    (hours.exceptions ?? []).forEach((ex, i) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.date ?? '')) add(['settings', 'openingHours', 'exceptions', i, 'date'], 'Bitte ein Datum wählen.');
    });
  }

  for (const [name, def] of Object.entries(COLLECTION_DEFS)) {
    if (def.shape === 'list' && doc.collections?.[name] !== undefined && !Array.isArray(doc.collections[name]))
      add(['collections', name], 'Unerwartetes Format.');
  }
  return out;
}

/** Alle Prüfhinweise (gemeinsame Prüfung im Modus „Veröffentlichen“ + eigene), ohne doppelte Meldungen am selben Feld */
export async function validateDoc(doc: SiteDoc): Promise<Issue[]> {
  const own = clientIssues(doc);
  let sharedIssues: Issue[] = [];
  try {
    const defs = { sections: SECTION_DEFS, collections: COLLECTION_DEFS } as unknown as Parameters<typeof validateSiteDoc>[1];
    sharedIssues = normalizeIssues(validateSiteDoc(doc, defs, { mode: 'publish' }), doc, 'shared');
  } catch (e) {
    console.warn('[admin] validateSiteDoc fehlgeschlagen — nur eigene Prüfungen', e);
    return own;
  }
  const covered = new Set(sharedIssues.map((i) => i.path));
  return [...sharedIssues, ...own.filter((i) => !covered.has(i.path))];
}
