/**
 * Durchläuft einen SiteDoc entlang der Felddefinitionen: alle Links/Linkziele, Bildverwendungen und
 * Verweise auf Seiten — für „Buttons & Links“, „Wo verwendet“, Löschen-Rückfragen und Prüfhinweise.
 */
import type { NavItem, PageDoc, SiteDoc } from '../cms/types';
import {
  COLLECTION_DEFS,
  FOOTER_DEFS,
  HEADER_DEFS,
  NAV_CTA_DEF,
  NAV_DEFS,
  STICKY_DEF,
  sectionDef,
  type AdminFieldDef,
} from './defs';
import { pagePath, richLinks } from './rich';
import { checkHref as sharedCheckHref } from '../cms/validate.mjs';
import { isPlainObject, labelOf, type PathSeg } from './util';

export interface Loc {
  /** menschenlesbar: „Seite Besuch › Text › Überschrift“ */
  label: string;
  /** Hash-Route zum Bearbeiten */
  route: string;
  /** absoluter Pfad im SiteDoc */
  path: PathSeg[];
  pageId?: string;
  sectionId?: string;
  /** Pfad innerhalb der Sektionsfelder (für den Editor) */
  fieldPath?: string;
}

export interface FieldVisit {
  def: AdminFieldDef;
  value: unknown;
  parent: Record<string, unknown>;
  loc: Loc;
}

function visitFields(
  defs: AdminFieldDef[],
  obj: Record<string, unknown>,
  base: Loc,
  visit: (v: FieldVisit) => void,
  fieldPrefix = '',
): void {
  for (const def of defs) {
    const value = obj[def.key];
    const loc: Loc = {
      ...base,
      label: `${base.label} › ${def.label}`,
      path: [...base.path, def.key],
      fieldPath: base.sectionId !== undefined ? `${fieldPrefix}${def.key}` : base.fieldPath,
    };
    visit({ def, value, parent: obj, loc });
    if (def.kind === 'list' && def.of && Array.isArray(value)) {
      value.forEach((item, i) => {
        if (!isPlainObject(item)) return;
        const lbl = def.itemLabel ? labelOf(item[def.itemLabel]) : '';
        const name = lbl ? `„${lbl}“` : `Nr. ${i + 1}`;
        visitFields(
          def.of as AdminFieldDef[],
          item,
          { ...loc, label: `${loc.label} ${name}`, path: [...loc.path, i] },
          visit,
          `${fieldPrefix}${def.key}.${i}.`,
        );
      });
    }
  }
}

/** Grobe Felderkennung für Sektionen ohne Definition (noch nicht umgebaute Typen) */
function guessDefs(obj: Record<string, unknown>): AdminFieldDef[] {
  const out: AdminFieldDef[] = [];
  for (const [key, v] of Object.entries(obj)) {
    if (isPlainObject(v) && typeof v.href === 'string' && 'label' in v) out.push({ key, label: key, kind: 'link' });
    else if (isPlainObject(v) && typeof v.media === 'string') out.push({ key, label: key, kind: 'media' });
    else if (typeof v === 'string' && /^(page:|\{\{(tel|route)\}\}|https?:|mailto:|tel:)/.test(v)) out.push({ key, label: key, kind: 'href' });
    else if (key === 'motif' && typeof v === 'string') out.push({ key, label: key, kind: 'media', idOnly: true });
    else if (Array.isArray(v) && v.every(isPlainObject) && v.length) {
      const merged: Record<string, unknown> = Object.assign({}, ...(v as Record<string, unknown>[]));
      out.push({ key, label: key, kind: 'list', of: guessDefs(merged) });
    }
  }
  return out;
}

export function pageLabel(p: PageDoc): string {
  return `Seite „${p.title || p.id}“`;
}

/** Alle Felder des Dokuments (Seiten/SEO, Navigation, Header & Footer, Einstellungen, Sammlungen) */
export function walkDoc(doc: SiteDoc, visit: (v: FieldVisit) => void): void {
  doc.pages.forEach((page, pi) => {
    const pbase: Loc = { label: pageLabel(page), route: `#/seiten/${page.id}`, path: ['pages', pi], pageId: page.id };
    if (page.seo) {
      visitFields(
        [{ key: 'ogImage', label: 'Vorschaubild (Teilen)', kind: 'media' }],
        page.seo as unknown as Record<string, unknown>,
        { ...pbase, label: `${pbase.label} › SEO`, route: `#/seiten/${page.id}/einstellungen`, path: [...pbase.path, 'seo'] },
        visit,
      );
    }
    (page.sections ?? []).forEach((s, si) => {
      const def = sectionDef(s.type);
      const fields = isPlainObject(s.fields) ? s.fields : {};
      const base: Loc = {
        label: `${pbase.label} › ${def?.label ?? s.type}`,
        route: `#/seiten/${page.id}?sektion=${encodeURIComponent(s.id)}`,
        path: [...pbase.path, 'sections', si, 'fields'],
        pageId: page.id,
        sectionId: s.id,
        fieldPath: '',
      };
      visitFields(def ? def.fields : guessDefs(fields), fields, base, visit);
    });
  });
  const nav = doc.navigation;
  if (nav) {
    visitFields(
      [...NAV_DEFS.map((n) => n.def), NAV_CTA_DEF],
      nav as unknown as Record<string, unknown>,
      { label: 'Navigation', route: '#/navigation', path: ['navigation'] },
      visit,
    );
  }
  const layout = doc.layout;
  if (layout) {
    if (layout.header) visitFields(HEADER_DEFS, layout.header as unknown as Record<string, unknown>, { label: 'Header', route: '#/layout', path: ['layout', 'header'] }, visit);
    if (layout.footer) visitFields(FOOTER_DEFS, layout.footer as unknown as Record<string, unknown>, { label: 'Footer', route: '#/layout', path: ['layout', 'footer'] }, visit);
    if (layout.stickyBar) visitFields([STICKY_DEF], layout.stickyBar as unknown as Record<string, unknown>, { label: 'Handy-Leiste', route: '#/layout', path: ['layout', 'stickyBar'] }, visit);
  }
  if (doc.settings?.seoDefaults) {
    visitFields(
      [{ key: 'ogImage', label: 'Standard-Vorschaubild', kind: 'media' }],
      doc.settings.seoDefaults as unknown as Record<string, unknown>,
      { label: 'SEO', route: '#/seo', path: ['settings', 'seoDefaults'] },
      visit,
    );
  }
  for (const [name, def] of Object.entries(COLLECTION_DEFS)) {
    const value = doc.collections?.[name];
    const route = COLLECTION_ROUTES[name] ?? '#/';
    if (def.shape === 'list' && Array.isArray(value)) {
      value.forEach((item, i) => {
        if (!isPlainObject(item)) return;
        const lbl = def.itemLabel ? labelOf(item[def.itemLabel]) : '';
        const nm = lbl ? `„${lbl}“` : `Nr. ${i + 1}`;
        visitFields(def.fields, item, { label: `${def.label} ${nm}`, route, path: ['collections', name, i] }, visit);
      });
    } else if (def.shape === 'object' && isPlainObject(value)) {
      visitFields(def.fields, value, { label: def.label, route, path: ['collections', name] }, visit);
    }
  }
}

export const COLLECTION_ROUTES: Record<string, string> = {
  menu: '#/karte',
  faq: '#/faq',
  testimonials: '#/stimmen',
  heuteFrisch: '#/backstube',
};

/* ------------------------------------------------------------------ Links ---------------------- */

export interface LinkUse {
  loc: Loc;
  kind: 'link' | 'href' | 'rich';
  label?: string;
  href: string;
  /** Objekt, in dem das Feld liegt, und Schlüssel (für Schnellbearbeitung) */
  parent: Record<string, unknown>;
  key: string;
  def: AdminFieldDef;
}

export function collectLinks(doc: SiteDoc): LinkUse[] {
  const out: LinkUse[] = [];
  walkDoc(doc, ({ def, value, parent, loc }) => {
    if (def.kind === 'link' && isPlainObject(value)) {
      out.push({ loc, kind: 'link', label: String(value.label ?? ''), href: String(value.href ?? ''), parent, key: def.key, def });
    } else if (def.kind === 'href') {
      const label = typeof parent.label === 'string' ? parent.label : undefined;
      out.push({ loc, kind: 'href', label, href: typeof value === 'string' ? value : '', parent, key: def.key, def });
    } else if (def.kind === 'rich' && typeof value === 'string') {
      for (const l of richLinks(value)) out.push({ loc, kind: 'rich', label: l.label, href: l.target, parent, key: def.key, def });
    }
  });
  return out;
}

/** Alle Stellen, die per page:<id> auf eine Seite zeigen */
export function pageReferences(doc: SiteDoc, pageId: string): LinkUse[] {
  return collectLinks(doc).filter((l) => l.href === `page:${pageId}` || l.href.startsWith(`page:${pageId}#`));
}

/* ------------------------------------------------------------------ Medien --------------------- */

export function mediaIdOf(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (isPlainObject(value) && typeof value.media === 'string') return value.media || null;
  return null;
}

/** Wo wird ein Bild verwendet? (alle Medien auf einmal: Map id → Fundstellen) */
export function mediaUsageMap(doc: SiteDoc): Map<string, Loc[]> {
  const map = new Map<string, Loc[]>();
  walkDoc(doc, ({ def, value, loc }) => {
    if (def.kind !== 'media' && !def.idOnly) return;
    const id = mediaIdOf(value);
    if (!id) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(loc);
  });
  return map;
}

/* ------------------------------------------------------------------ Linkziele prüfen ------------ */

/** Bekannte feste Adressen außerhalb des CMS (Server/Astro) */
const FIXED_PATHS = ['/', '/login', '/passwort', '/countdown', '/checkliste', '/module', '/varianten'];

export interface HrefCheck {
  level: 'error' | 'warning';
  message: string;
}

/** Alle Pfade, unter denen der Inhaltsstand Seiten ausliefert */
export function knownPaths(doc: SiteDoc): Set<string> {
  const set = new Set(FIXED_PATHS);
  for (const p of doc.pages) {
    if (p.template === 'menu-category') {
      const parent = p.slug.replace(/\/\*$/, '');
      for (const c of doc.collections?.menu ?? []) set.add(`/${parent}/${c.slug}`);
    } else set.add(pagePath(p));
  }
  return set;
}

export function checkHref(href: string, doc: SiteDoc, paths?: Set<string>): HrefCheck | null {
  const h = (href ?? '').trim();
  if (!h) return { level: 'error', message: 'Kein Ziel angegeben' };
  // Regeln der gemeinsamen Prüfung (src/cms/validate.mjs) — gleiche Einstufung wie beim Veröffentlichen
  const shared = sharedCheckHref(h, doc) as { error?: string; warning?: string };
  if (shared.error) return { level: 'error', message: shared.error.replace(/\.$/, '') };
  if (shared.warning) return { level: 'warning', message: shared.warning.replace(/\.$/, '') };
  if (h === '{{tel}}') return doc.settings?.phone ? null : { level: 'error', message: 'Keine Telefonnummer in den Einstellungen' };
  if (h === '{{route}}' || h.startsWith('page:')) return null;
  if (/^https?:\/\//i.test(h)) {
    try {
      const u = new URL(h);
      return u.hostname.includes('.') ? null : { level: 'error', message: 'Die Web-Adresse sieht unvollständig aus' };
    } catch {
      return { level: 'error', message: 'Ungültige Web-Adresse' };
    }
  }
  if (h.startsWith('mailto:')) return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/.test(h) ? null : { level: 'error', message: 'Ungültige E-Mail-Adresse' };
  if (h.startsWith('tel:')) return /^tel:\+?[\d\s/-]{5,}$/.test(h) ? null : { level: 'error', message: 'Ungültige Telefonnummer' };
  if (h.startsWith('#')) return null;
  if (h.startsWith('/') && !h.startsWith('//')) {
    const path = h.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const set = paths ?? knownPaths(doc);
    return set.has(path) ? null : { level: 'warning', message: 'Unter dieser Adresse gibt es keine bekannte Seite' };
  }
  return { level: 'error', message: 'Unbekanntes Linkziel' };
}

/** Linkziel menschenlesbar: „Seite: Besuch (/besuch)“ */
export function describeHref(href: string, doc: SiteDoc): string {
  const h = (href ?? '').trim();
  if (!h) return 'kein Ziel';
  if (h === '{{tel}}') return `Anruf: ${doc.settings?.phoneDisplay || doc.settings?.phone || 'Telefon aus den Einstellungen'}`;
  if (h === '{{route}}') return 'Routenplaner (Google Maps)';
  if (h.startsWith('page:')) {
    const [id, anchor] = h.slice(5).split('#');
    const page = doc.pages.find((p) => p.id === id);
    if (!page) return `Seite „${id}“ (fehlt)`;
    return `Seite „${page.title}“ (${pagePath(page)}${anchor ? `#${anchor}` : ''})`;
  }
  if (h.startsWith('mailto:')) return `E-Mail an ${h.slice(7)}`;
  if (h.startsWith('tel:')) return `Anruf: ${h.slice(4)}`;
  if (/^https?:\/\//i.test(h)) return h.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return h;
}

/** Alle Navigations-Einträge (für Seitenreferenzen in Listen) */
export function flatNav(items: NavItem[] | undefined): NavItem[] {
  return (items ?? []).flatMap((i) => [i, ...flatNav(i.children)]);
}
